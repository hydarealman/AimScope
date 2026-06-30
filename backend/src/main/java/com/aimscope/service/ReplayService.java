package com.aimscope.service;

import com.aimscope.model.entity.ReplaySession;
import com.aimscope.repository.ReplaySessionRepository;
import com.influxdb.client.InfluxDBClient;
import com.influxdb.client.QueryApi;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.LocalDateTime;
import java.util.*;

@Service
public class ReplayService {

    private final ReplaySessionRepository replayRepo;
    private final InfluxDBClient influxDBClient;
    private final String uploadDir = "./uploads/replays";

    public ReplayService(ReplaySessionRepository replayRepo, InfluxDBClient influxDBClient) {
        this.replayRepo = replayRepo;
        this.influxDBClient = influxDBClient;
        try { Files.createDirectories(Paths.get(uploadDir)); } catch (Exception ignored) {}
    }

    public List<Map<String, Object>> listSessions() {
        List<Map<String, Object>> result = new ArrayList<>();
        for (ReplaySession s : replayRepo.findAllByOrderByCreatedAtDesc()) {
            result.add(toSummaryMap(s));
        }
        return result;
    }

    public Map<String, Object> getSession(Long id) {
        ReplaySession session = replayRepo.findById(id)
                .orElseThrow(() -> new RuntimeException("Replay session not found: " + id));
        return toDetailMap(session);
    }

    @Transactional
    public Map<String, Object> uploadFile(MultipartFile file) throws IOException {
        // Save file
        String originalName = file.getOriginalFilename();
        String safeName = System.currentTimeMillis() + "_" + (originalName != null ? originalName : "upload");
        Path filePath = Paths.get(uploadDir, safeName);
        Files.createDirectories(filePath.getParent());
        file.transferTo(filePath.toFile());

        // Compute hash
        byte[] fileBytes = Files.readAllBytes(filePath);
        String hash;
        try {
            hash = bytesToHex(MessageDigest.getInstance("SHA-256").digest(fileBytes));
        } catch (NoSuchAlgorithmException e) {
            throw new RuntimeException("SHA-256 not available", e);
        }

        // Create session record
        ReplaySession session = new ReplaySession();
        session.setOriginalFilename(originalName);
        session.setFileSize(file.getSize());
        session.setFileHash(hash);
        session.setFilePath(filePath.toString());
        session.setStatus(ReplaySession.Status.UPLOADED);
        session = replayRepo.save(session);

        // Async parse
        parseReplayAsync(session.getId(), filePath.toString());

        return toSummaryMap(session);
    }

    @Async
    public void parseReplayAsync(Long sessionId, String filePath) {
        ReplaySession session = replayRepo.findById(sessionId).orElse(null);
        if (session == null) return;

        session.setStatus(ReplaySession.Status.PARSING);
        replayRepo.save(session);

        try {
            String ext = session.getOriginalFilename() != null
                    ? session.getOriginalFilename().toLowerCase() : "";

            if (ext.endsWith(".json") || ext.endsWith(".aimscope.json")) {
                parseJsonFile(session, filePath);
            } else if (ext.endsWith(".bag") || ext.endsWith(".mcap") || ext.endsWith(".db3")) {
                parseRosbagFile(session, filePath);
            } else {
                // Try to detect format from content
                String firstLine = Files.readString(Path.of(filePath)).trim();
                if (firstLine.startsWith("{") || firstLine.startsWith("[")) {
                    parseJsonFile(session, filePath);
                } else {
                    parseRosbagFile(session, filePath);
                }
            }

            session.setStatus(ReplaySession.Status.READY);
            replayRepo.save(session);
        } catch (Exception e) {
            session.setStatus(ReplaySession.Status.ERROR);
            session.setErrorMessage(e.getMessage());
            replayRepo.save(session);
        }
    }

    private void parseJsonFile(ReplaySession session, String filePath) throws IOException {
        String content = Files.readString(Path.of(filePath));
        // Parse aimscope JSON format -> write to InfluxDB
        // This is handled by the Python converter for efficiency
        ProcessBuilder pb = new ProcessBuilder("python3",
                "./scripts/python/rosbag_converter.py",
                "--format", "json",
                "--file", filePath,
                "--replay-id", session.getId().toString(),
                "--influx-url", "http://localhost:8086",
                "--influx-token", "aimscope-token-placeholder",
                "--influx-org", "aimscope",
                "--influx-bucket", "aimscope"
        );
        pb.inheritIO();
        Process p = pb.start();
        try {
            int exitCode = p.waitFor();
            if (exitCode != 0) throw new RuntimeException("Python converter failed with exit code " + exitCode);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new RuntimeException("Parsing interrupted");
        }
    }

    private void parseRosbagFile(ReplaySession session, String filePath) throws Exception {
        ProcessBuilder pb = new ProcessBuilder("python3",
                "./scripts/python/rosbag_converter.py",
                "--format", "rosbag",
                "--file", filePath,
                "--replay-id", session.getId().toString(),
                "--influx-url", "http://localhost:8086",
                "--influx-token", "aimscope-token-placeholder",
                "--influx-org", "aimscope",
                "--influx-bucket", "aimscope"
        );
        pb.inheritIO();
        Process p = pb.start();
        try {
            int exitCode = p.waitFor();
            if (exitCode != 0) throw new RuntimeException("Rosbag converter failed with exit code " + exitCode);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new RuntimeException("Parsing interrupted");
        }
    }

    public List<Map<String, Object>> queryData(Long replayId, String topic, long fromMs, long toMs) {
        QueryApi queryApi = influxDBClient.getQueryApi();
        String flux = String.format(
                "from(bucket:\"aimscope\") " +
                "|> range(start: time(v: %d), stop: time(v: %d)) " +
                "|> filter(fn: (r) => r.replay_id == \"%d\" and r.topic_name == \"%s\") " +
                "|> sort(columns: [\"_time\"]) " +
                "|> limit(n: 5000)",
                fromMs * 1_000_000L, toMs * 1_000_000L, replayId, topic);

        List<Map<String, Object>> results = new ArrayList<>();
        queryApi.queryRaw(flux, (cancellable, line) -> {
            Map<String, Object> m = new HashMap<>();
            m.put("raw", line);
            results.add(m);
        }, error -> {
            System.err.println("[ReplayService] InfluxDB query error: " + error.getMessage());
        }, () -> {
            // query complete
        });

        return results;
    }

    @Transactional
    public void deleteSession(Long id) {
        replayRepo.deleteById(id);
    }

    // Private helpers
    private Map<String, Object> toSummaryMap(ReplaySession s) {
        Map<String, Object> m = new HashMap<>();
        m.put("id", s.getId());
        m.put("originalFilename", s.getOriginalFilename());
        m.put("fileSize", s.getFileSize());
        m.put("topicCount", s.getTopicCount());
        m.put("messageCount", s.getMessageCount());
        m.put("status", s.getStatus().name());
        m.put("totalDurationMs", s.getTotalDurationMs());
        m.put("createdAt", s.getCreatedAt().toString());
        return m;
    }

    private Map<String, Object> toDetailMap(ReplaySession s) {
        Map<String, Object> m = toSummaryMap(s);
        m.put("fileHash", s.getFileHash());
        m.put("errorMessage", s.getErrorMessage());
        m.put("filePath", s.getFilePath());
        return m;
    }

    private String bytesToHex(byte[] bytes) {
        StringBuilder sb = new StringBuilder();
        for (byte b : bytes) sb.append(String.format("%02x", b));
        return sb.toString();
    }
}
