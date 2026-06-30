package com.aimscope.repository;

import com.aimscope.model.entity.BenchmarkRun;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface BenchmarkRunRepository extends JpaRepository<BenchmarkRun, Long> {
    List<BenchmarkRun> findAllByOrderByCreatedAtDesc();
    List<BenchmarkRun> findByStatus(BenchmarkRun.Status status);
}
