package com.aimscope.model.entity;

import javax.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "param_configs")
public class ParamConfig {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 128)
    private String name;

    @Column(length = 512)
    private String description;

    @Enumerated(EnumType.STRING)
    @Column(name = "file_type", nullable = false, length = 8)
    private FileType fileType = FileType.YAML;

    @Column(name = "current_content", columnDefinition = "TEXT")
    private String currentContent;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt = LocalDateTime.now();

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt = LocalDateTime.now();

    @Column(name = "current_version")
    private Integer currentVersion = 1;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "last_author_id")
    private User lastAuthor;

    public enum FileType {
        YAML, JSON
    }

    public ParamConfig() {}

    // Getters and setters
    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }
    public FileType getFileType() { return fileType; }
    public void setFileType(FileType fileType) { this.fileType = fileType; }
    public String getCurrentContent() { return currentContent; }
    public void setCurrentContent(String currentContent) { this.currentContent = currentContent; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime updatedAt) { this.updatedAt = updatedAt; }
    public Integer getCurrentVersion() { return currentVersion; }
    public void setCurrentVersion(Integer currentVersion) { this.currentVersion = currentVersion; }
    public User getLastAuthor() { return lastAuthor; }
    public void setLastAuthor(User lastAuthor) { this.lastAuthor = lastAuthor; }
}
