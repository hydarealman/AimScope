package com.aimscope.service;

import com.aimscope.dto.ParamUpdateRequest;
import com.aimscope.model.entity.ParamConfig;
import com.aimscope.model.entity.ParamVersion;
import com.aimscope.model.entity.User;
import com.aimscope.repository.ParamConfigRepository;
import com.aimscope.repository.ParamVersionRepository;
import com.aimscope.repository.UserRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

@Service
public class ParamService {

    private final ParamConfigRepository configRepo;
    private final ParamVersionRepository versionRepo;
    private final UserRepository userRepo;
    private final String configsDir = "./configs";

    public ParamService(ParamConfigRepository configRepo,
                        ParamVersionRepository versionRepo,
                        UserRepository userRepo) {
        this.configRepo = configRepo;
        this.versionRepo = versionRepo;
        this.userRepo = userRepo;
        try { Files.createDirectories(Paths.get(configsDir)); } catch (Exception ignored) {}
    }

    public List<Map<String, Object>> listConfigs() {
        return configRepo.findAllByOrderByUpdatedAtDesc().stream()
                .map(this::toSummaryMap)
                .collect(Collectors.toList());
    }

    public Map<String, Object> getConfig(Long id) {
        ParamConfig config = configRepo.findById(id)
                .orElseThrow(() -> new RuntimeException("Config not found: " + id));
        return toDetailMap(config);
    }

    @Transactional
    public Map<String, Object> createConfig(String name, String description, String fileType, String content, Long authorId) {
        if (configRepo.existsByName(name)) {
            throw new RuntimeException("Config name already exists: " + name);
        }

        User author = userRepo.findById(authorId)
                .orElseThrow(() -> new RuntimeException("User not found"));

        ParamConfig config = new ParamConfig();
        config.setName(name);
        config.setDescription(description);
        config.setFileType(ParamConfig.FileType.valueOf(fileType.toUpperCase()));
        config.setCurrentContent(content);
        config.setCurrentVersion(1);
        config.setLastAuthor(author);
        config = configRepo.save(config);

        // Create first version
        createVersion(config, content, author, "Initial version", null);
        writeConfigFile(config);
        gitCommit(config);

        return toDetailMap(config);
    }

    @Transactional
    public Map<String, Object> updateConfig(Long id, ParamUpdateRequest request, Long authorId) {
        ParamConfig config = configRepo.findById(id)
                .orElseThrow(() -> new RuntimeException("Config not found: " + id));
        User author = userRepo.findById(authorId)
                .orElseThrow(() -> new RuntimeException("User not found"));

        String prevContent = config.getCurrentContent();
        int newVersion = config.getCurrentVersion() + 1;

        config.setCurrentContent(request.getContent());
        config.setCurrentVersion(newVersion);
        config.setUpdatedAt(LocalDateTime.now());
        config.setLastAuthor(author);
        configRepo.save(config);

        String diff = generateDiff(prevContent, request.getContent());
        createVersion(config, request.getContent(), author, request.getMessage(), diff);
        writeConfigFile(config);
        gitCommit(config);

        return toDetailMap(config);
    }

    public List<Map<String, Object>> getVersions(Long configId) {
        List<ParamVersion> versions = versionRepo.findByConfigIdOrderByVersionNumDesc(configId);
        return versions.stream().map(v -> {
            Map<String, Object> m = new HashMap<>();
            m.put("id", v.getId());
            m.put("versionNum", v.getVersionNum());
            m.put("content", v.getContent());
            m.put("gitCommitHash", v.getGitCommitHash());
            m.put("diffFromPrev", v.getDiffFromPrev());
            m.put("message", v.getMessage());
            m.put("authorName", v.getAuthor().getUsername());
            m.put("createdAt", v.getCreatedAt().toString());
            return m;
        }).collect(Collectors.toList());
    }

    public Map<String, Object> getVersion(Long configId, Integer versionNum) {
        ParamConfig config = configRepo.findById(configId)
                .orElseThrow(() -> new RuntimeException("Config not found"));
        ParamVersion version = versionRepo.findByConfigAndVersionNum(config, versionNum)
                .orElseThrow(() -> new RuntimeException("Version not found"));
        Map<String, Object> m = new HashMap<>();
        m.put("id", version.getId());
        m.put("versionNum", version.getVersionNum());
        m.put("content", version.getContent());
        m.put("authorName", version.getAuthor().getUsername());
        m.put("createdAt", version.getCreatedAt().toString());
        return m;
    }

    @Transactional
    public Map<String, Object> rollback(Long configId, Integer versionNum, Long authorId) {
        ParamConfig config = configRepo.findById(configId)
                .orElseThrow(() -> new RuntimeException("Config not found"));
        ParamVersion target = versionRepo.findByConfigAndVersionNum(config, versionNum)
                .orElseThrow(() -> new RuntimeException("Version not found"));

        ParamUpdateRequest req = new ParamUpdateRequest();
        req.setContent(target.getContent());
        req.setMessage("Rollback to version " + versionNum);
        return updateConfig(configId, req, authorId);
    }

    public String diff(Long configId, int v1, int v2) {
        ParamConfig config = configRepo.findById(configId)
                .orElseThrow(() -> new RuntimeException("Config not found"));
        ParamVersion ver1 = versionRepo.findByConfigAndVersionNum(config, v1)
                .orElseThrow(() -> new RuntimeException("Version " + v1 + " not found"));
        ParamVersion ver2 = versionRepo.findByConfigAndVersionNum(config, v2)
                .orElseThrow(() -> new RuntimeException("Version " + v2 + " not found"));
        return generateDiff(ver1.getContent(), ver2.getContent());
    }

    // --- Private helpers ---

    private void createVersion(ParamConfig config, String content, User author, String message, String diff) {
        ParamVersion version = new ParamVersion();
        version.setConfig(config);
        version.setVersionNum(config.getCurrentVersion());
        version.setContent(content);
        version.setAuthor(author);
        version.setMessage(message != null ? message : "");
        version.setDiffFromPrev(diff);
        versionRepo.save(version);
    }

    private void writeConfigFile(ParamConfig config) {
        try {
            String ext = config.getFileType() == ParamConfig.FileType.JSON ? ".json" : ".yaml";
            Path path = Paths.get(configsDir, config.getName() + ext);
            Files.write(path, config.getCurrentContent().getBytes(java.nio.charset.StandardCharsets.UTF_8));
        } catch (Exception e) {
            throw new RuntimeException("Failed to write config file: " + e.getMessage());
        }
    }

    private void gitCommit(ParamConfig config) {
        try {
            String ext = config.getFileType() == ParamConfig.FileType.JSON ? ".json" : ".yaml";
            String filename = config.getName() + ext;
            String msg = "v" + config.getCurrentVersion() + ": " + config.getName();

            // Stage file
            ProcessBuilder stage = new ProcessBuilder("git", "add", filename);
            stage.directory(new java.io.File(configsDir));
            stage.start().waitFor();

            // Commit
            ProcessBuilder commit = new ProcessBuilder("git", "commit", "-m", msg, "--allow-empty");
            commit.directory(new java.io.File(configsDir));
            commit.start().waitFor();
        } catch (Exception e) {
            // Non-fatal: git not available or not initialized
            System.err.println("Git commit warning: " + e.getMessage());
        }
    }

    private String generateDiff(String oldContent, String newContent) {
        if (oldContent == null || newContent == null) return "";
        try {
            Path oldFile = Files.createTempFile("diff_old_", ".tmp");
            Path newFile = Files.createTempFile("diff_new_", ".tmp");
            Files.write(oldFile, oldContent.getBytes(java.nio.charset.StandardCharsets.UTF_8));
            Files.write(newFile, newContent.getBytes(java.nio.charset.StandardCharsets.UTF_8));

            ProcessBuilder pb = new ProcessBuilder("diff", "-u",
                    oldFile.toString(), newFile.toString());
            Process p = pb.start();
            String result = new String(p.getInputStream().readAllBytes(), java.nio.charset.StandardCharsets.UTF_8);
            Files.deleteIfExists(oldFile);
            Files.deleteIfExists(newFile);
            return result.isEmpty() ? "(no changes)" : result;
        } catch (Exception e) {
            // Fallback: simple line count diff
            int oldLines = oldContent.split("\n").length;
            int newLines = newContent.split("\n").length;
            return "--- (old: " + oldLines + " lines)\n+++ (new: " + newLines + " lines)\n" +
                   "@@ Changes not available without diff command @@";
        }
    }

    private Map<String, Object> toSummaryMap(ParamConfig c) {
        Map<String, Object> m = new HashMap<>();
        m.put("id", c.getId());
        m.put("name", c.getName());
        m.put("description", c.getDescription());
        m.put("fileType", c.getFileType().name());
        m.put("currentVersion", c.getCurrentVersion());
        m.put("updatedAt", c.getUpdatedAt().toString());
        if (c.getLastAuthor() != null) m.put("lastAuthor", c.getLastAuthor().getUsername());
        return m;
    }

    private Map<String, Object> toDetailMap(ParamConfig c) {
        Map<String, Object> m = toSummaryMap(c);
        m.put("currentContent", c.getCurrentContent());
        m.put("createdAt", c.getCreatedAt().toString());
        return m;
    }
}
