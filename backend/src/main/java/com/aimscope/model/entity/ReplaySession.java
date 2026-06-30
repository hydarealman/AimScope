package com.aimscope.model.entity;

import javax.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "replay_sessions")
public class ReplaySession {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "original_filename", length = 256)
    private String originalFilename;

    @Column(name = "file_size")
    private Long fileSize;

    @Column(name = "file_hash", length = 64)
    private String fileHash;

    @Column(name = "total_duration_ms")
    private Long totalDurationMs;

    @Column(name = "topic_count")
    private Integer topicCount = 0;

    @Column(name = "message_count")
    private Long messageCount = 0L;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 12)
    private Status status = Status.UPLOADED;

    @Column(name = "error_message", columnDefinition = "TEXT")
    private String errorMessage;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt = LocalDateTime.now();

    @Column(name = "file_path", length = 512)
    private String filePath;

    @Column(name = "uploaded_by")
    private Long uploadedBy;

    public enum Status {
        UPLOADED, PARSING, READY, ERROR
    }

    public ReplaySession() {}

    // Getters and setters
    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getOriginalFilename() { return originalFilename; }
    public void setOriginalFilename(String originalFilename) { this.originalFilename = originalFilename; }
    public Long getFileSize() { return fileSize; }
    public void setFileSize(Long fileSize) { this.fileSize = fileSize; }
    public String getFileHash() { return fileHash; }
    public void setFileHash(String fileHash) { this.fileHash = fileHash; }
    public Long getTotalDurationMs() { return totalDurationMs; }
    public void setTotalDurationMs(Long totalDurationMs) { this.totalDurationMs = totalDurationMs; }
    public Integer getTopicCount() { return topicCount; }
    public void setTopicCount(Integer topicCount) { this.topicCount = topicCount; }
    public Long getMessageCount() { return messageCount; }
    public void setMessageCount(Long messageCount) { this.messageCount = messageCount; }
    public Status getStatus() { return status; }
    public void setStatus(Status status) { this.status = status; }
    public String getErrorMessage() { return errorMessage; }
    public void setErrorMessage(String errorMessage) { this.errorMessage = errorMessage; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
    public String getFilePath() { return filePath; }
    public void setFilePath(String filePath) { this.filePath = filePath; }
    public Long getUploadedBy() { return uploadedBy; }
    public void setUploadedBy(Long uploadedBy) { this.uploadedBy = uploadedBy; }
}
