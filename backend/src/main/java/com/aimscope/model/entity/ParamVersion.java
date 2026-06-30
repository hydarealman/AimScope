package com.aimscope.model.entity;

import javax.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "param_versions")
public class ParamVersion {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "config_id", nullable = false)
    private ParamConfig config;

    @Column(name = "version_num", nullable = false)
    private Integer versionNum;

    @Column(columnDefinition = "TEXT", nullable = false)
    private String content;

    @Column(name = "git_commit_hash", length = 40)
    private String gitCommitHash;

    @Column(name = "diff_from_prev", columnDefinition = "TEXT")
    private String diffFromPrev;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "author_id", nullable = false)
    private User author;

    @Column(length = 256)
    private String message;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt = LocalDateTime.now();

    public ParamVersion() {}

    // Getters and setters
    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public ParamConfig getConfig() { return config; }
    public void setConfig(ParamConfig config) { this.config = config; }
    public Integer getVersionNum() { return versionNum; }
    public void setVersionNum(Integer versionNum) { this.versionNum = versionNum; }
    public String getContent() { return content; }
    public void setContent(String content) { this.content = content; }
    public String getGitCommitHash() { return gitCommitHash; }
    public void setGitCommitHash(String gitCommitHash) { this.gitCommitHash = gitCommitHash; }
    public String getDiffFromPrev() { return diffFromPrev; }
    public void setDiffFromPrev(String diffFromPrev) { this.diffFromPrev = diffFromPrev; }
    public User getAuthor() { return author; }
    public void setAuthor(User author) { this.author = author; }
    public String getMessage() { return message; }
    public void setMessage(String message) { this.message = message; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
}
