package com.aimscope.model.entity;

import javax.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "benchmark_runs")
public class BenchmarkRun {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 256)
    private String name;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "replay_id", nullable = false)
    private ReplaySession replaySession;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "config_a_id")
    private ParamConfig configA;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "config_b_id")
    private ParamConfig configB;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 12)
    private Status status = Status.PENDING;

    @Column(name = "metrics_json", columnDefinition = "TEXT")
    private String metricsJson;

    @Column(name = "report_markdown", columnDefinition = "TEXT")
    private String reportMarkdown;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt = LocalDateTime.now();

    public enum Status {
        PENDING, RUNNING, DONE, FAILED
    }

    public BenchmarkRun() {}

    // Getters and setters
    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public ReplaySession getReplaySession() { return replaySession; }
    public void setReplaySession(ReplaySession replaySession) { this.replaySession = replaySession; }
    public ParamConfig getConfigA() { return configA; }
    public void setConfigA(ParamConfig configA) { this.configA = configA; }
    public ParamConfig getConfigB() { return configB; }
    public void setConfigB(ParamConfig configB) { this.configB = configB; }
    public Status getStatus() { return status; }
    public void setStatus(Status status) { this.status = status; }
    public String getMetricsJson() { return metricsJson; }
    public void setMetricsJson(String metricsJson) { this.metricsJson = metricsJson; }
    public String getReportMarkdown() { return reportMarkdown; }
    public void setReportMarkdown(String reportMarkdown) { this.reportMarkdown = reportMarkdown; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
}
