package com.aimscope.dto;

import javax.validation.constraints.NotBlank;
import javax.validation.constraints.NotNull;

public class BenchmarkRequest {
    @NotBlank
    private String name;

    @NotNull
    private Long replayId;

    private Long configAId;
    private Long configBId;

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public Long getReplayId() { return replayId; }
    public void setReplayId(Long replayId) { this.replayId = replayId; }
    public Long getConfigAId() { return configAId; }
    public void setConfigAId(Long configAId) { this.configAId = configAId; }
    public Long getConfigBId() { return configBId; }
    public void setConfigBId(Long configBId) { this.configBId = configBId; }
}
