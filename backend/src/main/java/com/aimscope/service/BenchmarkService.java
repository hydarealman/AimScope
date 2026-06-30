package com.aimscope.service;

import com.aimscope.dto.BenchmarkRequest;
import com.aimscope.model.entity.BenchmarkRun;
import com.aimscope.model.entity.ParamConfig;
import com.aimscope.model.entity.ReplaySession;
import com.aimscope.repository.BenchmarkRunRepository;
import com.aimscope.repository.ParamConfigRepository;
import com.aimscope.repository.ReplaySessionRepository;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.*;

@Service
public class BenchmarkService {

    private final BenchmarkRunRepository benchmarkRepo;
    private final ReplaySessionRepository replayRepo;
    private final ParamConfigRepository paramRepo;

    public BenchmarkService(BenchmarkRunRepository benchmarkRepo,
                            ReplaySessionRepository replayRepo,
                            ParamConfigRepository paramRepo) {
        this.benchmarkRepo = benchmarkRepo;
        this.replayRepo = replayRepo;
        this.paramRepo = paramRepo;
    }

    public List<Map<String, Object>> listRuns() {
        List<Map<String, Object>> result = new ArrayList<>();
        for (BenchmarkRun r : benchmarkRepo.findAllByOrderByCreatedAtDesc()) {
            result.add(toSummaryMap(r));
        }
        return result;
    }

    public Map<String, Object> getRun(Long id) {
        BenchmarkRun run = benchmarkRepo.findById(id)
                .orElseThrow(() -> new RuntimeException("Benchmark not found: " + id));
        return toDetailMap(run);
    }

    @Transactional
    public BenchmarkRun createRun(BenchmarkRequest request) {
        ReplaySession session = replayRepo.findById(request.getReplayId())
                .orElseThrow(() -> new RuntimeException("Replay session not found"));

        BenchmarkRun run = new BenchmarkRun();
        run.setName(request.getName());
        run.setReplaySession(session);
        run.setStatus(BenchmarkRun.Status.PENDING);

        if (request.getConfigAId() != null) {
            ParamConfig configA = paramRepo.findById(request.getConfigAId())
                    .orElseThrow(() -> new RuntimeException("Config A not found"));
            run.setConfigA(configA);
        }
        if (request.getConfigBId() != null) {
            ParamConfig configB = paramRepo.findById(request.getConfigBId())
                    .orElseThrow(() -> new RuntimeException("Config B not found"));
            run.setConfigB(configB);
        }

        run = benchmarkRepo.save(run);
        executeBenchmarkAsync(run.getId());
        return run;
    }

    @Async
    public void executeBenchmarkAsync(Long runId) {
        BenchmarkRun run = benchmarkRepo.findById(runId).orElse(null);
        if (run == null) return;

        run.setStatus(BenchmarkRun.Status.RUNNING);
        benchmarkRepo.save(run);

        try {
            // Call Python benchmark runner
            ProcessBuilder pb = new ProcessBuilder("python3",
                    "./scripts/python/benchmark_runner.py",
                    "--replay-file", run.getReplaySession().getFilePath(),
                    "--config-a", getConfigFilePath(run.getConfigA()),
                    "--config-b", getConfigFilePath(run.getConfigB()),
                    "--output-json", "./uploads/replays/benchmark_" + runId + ".json"
            );
            pb.inheritIO();
            Process p = pb.start();
            int exitCode = p.waitFor();

            if (exitCode == 0) {
                // Read results
                String resultJson = java.nio.file.Files.readString(
                        Path.of("./uploads/replays/benchmark_" + runId + ".json"));
                run.setMetricsJson(resultJson);
                run.setReportMarkdown(generateReport(run, resultJson));
                run.setStatus(BenchmarkRun.Status.DONE);
            } else {
                run.setStatus(BenchmarkRun.Status.FAILED);
                run.setMetricsJson("{\"error\": \"Exit code " + exitCode + "\"}");
            }
        } catch (Exception e) {
            run.setStatus(BenchmarkRun.Status.FAILED);
            run.setMetricsJson("{\"error\": \"" + e.getMessage() + "\"}");
        }
        benchmarkRepo.save(run);
    }

    private String getConfigFilePath(ParamConfig config) {
        if (config == null) return "";
        String ext = config.getFileType() == ParamConfig.FileType.JSON ? ".json" : ".yaml";
        return "./configs/" + config.getName() + ext;
    }

    private String generateReport(BenchmarkRun run, String metricsJson) {
        StringBuilder sb = new StringBuilder();
        sb.append("# Benchmark Report: ").append(run.getName()).append("\n\n");
        sb.append("**Status**: ").append(run.getStatus().name()).append("\n\n");
        sb.append("## Metrics\n\n```json\n").append(metricsJson).append("\n```\n\n");
        sb.append("## Comparison\n\n");
        sb.append("| Metric | Config A | Config B | Δ |\n");
        sb.append("|--------|----------|----------|---|\n");
        sb.append("| - | - | - | - |\n");
        sb.append("\n*Detailed comparison requires running the benchmark against actual algorithm code.*\n");
        return sb.toString();
    }

    private Map<String, Object> toSummaryMap(BenchmarkRun r) {
        Map<String, Object> m = new HashMap<>();
        m.put("id", r.getId());
        m.put("name", r.getName());
        m.put("status", r.getStatus().name());
        m.put("replayName", r.getReplaySession().getOriginalFilename());
        if (r.getConfigA() != null) m.put("configAName", r.getConfigA().getName());
        if (r.getConfigB() != null) m.put("configBName", r.getConfigB().getName());
        m.put("createdAt", r.getCreatedAt().toString());
        return m;
    }

    private Map<String, Object> toDetailMap(BenchmarkRun r) {
        Map<String, Object> m = toSummaryMap(r);
        m.put("metricsJson", r.getMetricsJson());
        m.put("reportMarkdown", r.getReportMarkdown());
        return m;
    }
}
