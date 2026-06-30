package com.aimscope.repository;

import com.aimscope.model.entity.ParamConfig;
import com.aimscope.model.entity.ParamVersion;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;

public interface ParamVersionRepository extends JpaRepository<ParamVersion, Long> {
    List<ParamVersion> findByConfigOrderByVersionNumDesc(ParamConfig config);
    List<ParamVersion> findByConfigIdOrderByVersionNumDesc(Long configId);
    Optional<ParamVersion> findByConfigAndVersionNum(ParamConfig config, Integer versionNum);
    long countByConfig(ParamConfig config);
}
