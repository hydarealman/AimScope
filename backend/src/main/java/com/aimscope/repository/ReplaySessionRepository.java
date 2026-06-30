package com.aimscope.repository;

import com.aimscope.model.entity.ReplaySession;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface ReplaySessionRepository extends JpaRepository<ReplaySession, Long> {
    List<ReplaySession> findAllByOrderByCreatedAtDesc();
    List<ReplaySession> findByStatus(ReplaySession.Status status);
}
