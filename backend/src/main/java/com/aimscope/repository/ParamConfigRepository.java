package com.aimscope.repository;

import com.aimscope.model.entity.ParamConfig;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface ParamConfigRepository extends JpaRepository<ParamConfig, Long> {
    List<ParamConfig> findAllByOrderByUpdatedAtDesc();
    boolean existsByName(String name);
}
