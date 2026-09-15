package com.timecapsule.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.timecapsule.common.BusinessException;
import com.timecapsule.dto.KnowledgeDocView;
import com.timecapsule.dto.PersonaCreateRequest;
import com.timecapsule.entity.KnowledgeDoc;
import com.timecapsule.entity.Persona;
import com.timecapsule.entity.PersonaDoc;
import com.timecapsule.mapper.PersonaDocMapper;
import com.timecapsule.mapper.PersonaMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.util.List;

/**
 * 「自己的分身」服务：管理代表不同时间点的自我人格。
 * <p>
 * 与时间胶囊的关系：胶囊是「写下那句话时的我」，是单向的一次性寄语；
 * 分身是「何时的我」，由知识库蒸馏而来，可以反复对话。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class PersonaService {

    private final PersonaMapper personaMapper;
    private final PersonaDocMapper personaDocMapper;
    private final KnowledgeService knowledgeService;
    private final PersonaGenerator generator;
    private final UserService userService;

    public List<Persona> listByUser(Long userId) {
        requireUserId(userId);
        return personaMapper.selectList(new LambdaQueryWrapper<Persona>()
                .eq(Persona::getUserId, userId)
                .orderByDesc(Persona::getSelfDate));
    }

    /** 按 id 取分身，同时校验归属 */
    public Persona getOwned(Long id, Long userId) {
        if (id == null || userId == null) {
            throw new BusinessException("分身ID和用户ID不能为空");
        }
        Persona persona = personaMapper.selectOne(new LambdaQueryWrapper<Persona>()
                .eq(Persona::getId, id)
                .eq(Persona::getUserId, userId));
        if (persona == null) {
            throw new BusinessException(404, "分身不存在或不属于当前用户");
        }
        return persona;
    }

    /** 对话前必须确认分身已经生成好 */
    public Persona getReady(Long id, Long userId) {
        Persona persona = getOwned(id, userId);
        if (Persona.STATUS_GENERATING.equals(persona.getStatus())) {
            throw new BusinessException("这个分身还在生成中，请稍等几秒再试");
        }
        if (!Persona.STATUS_READY.equals(persona.getStatus())) {
            throw new BusinessException("这个分身还没有生成好，请到「我的分身」页面点重新生成");
        }
        return persona;
    }

    /**
     * 创建分身：先落库一条 GENERATING 记录，再在<b>事务提交后</b>触发后台生成。
     * <p>
     * 用 afterCommit 而不是直接提交任务是必须的：后台线程若在事务提交前就跑起来，
     * 它读 persona_docs 关联表可能读不到刚插入的行，导致"选了文档却说没有文档"。
     */
    @Transactional(rollbackFor = Exception.class)
    public Persona create(PersonaCreateRequest request) {
        userService.getById(request.getUserId());

        List<KnowledgeDoc> docs = knowledgeService.listOwnedDocs(request.getUserId(), request.getDocIds());
        if (docs.isEmpty()) {
            throw new BusinessException("选择的知识库文档不存在，请先在「知识库」页面导入");
        }

        Persona persona = new Persona();
        persona.setUserId(request.getUserId());
        persona.setName(request.getName().trim());
        persona.setSelfDate(request.getSelfDate());
        persona.setStatus(Persona.STATUS_GENERATING);
        persona.setDocCount(docs.size());
        persona.setDeleted(0);
        personaMapper.insert(persona);

        for (KnowledgeDoc doc : docs) {
            PersonaDoc link = new PersonaDoc();
            link.setPersonaId(persona.getId());
            link.setDocId(doc.getId());
            personaDocMapper.insert(link);
        }

        Long personaId = persona.getId();
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    generator.generateAsync(personaId);
                }
            });
        } else {
            generator.generateAsync(personaId);
        }

        log.info("用户 {} 创建分身《{}》，引用 {} 篇文档", request.getUserId(), persona.getName(), docs.size());
        return personaMapper.selectById(personaId);
    }

    /** 用同样的文档重新蒸馏一次（模型抽风或改了 key 之后用） */
    public Persona regenerate(Long id, Long userId) {
        Persona persona = getOwned(id, userId);
        persona.setStatus(Persona.STATUS_GENERATING);
        persona.setFailReason(null);
        personaMapper.updateById(persona);
        generator.generateAsync(id);
        return personaMapper.selectById(id);
    }

    /** 删除分身（逻辑删除），同时清掉关联表里的行 */
    @Transactional(rollbackFor = Exception.class)
    public void delete(Long id, Long userId) {
        getOwned(id, userId);
        personaMapper.deleteById(id);
        personaDocMapper.delete(new LambdaQueryWrapper<PersonaDoc>()
                .eq(PersonaDoc::getPersonaId, id));
    }

    /** 该分身引用了哪些知识库文档 */
    public List<KnowledgeDocView> docsOf(Long personaId) {
        List<PersonaDoc> links = personaDocMapper.selectList(new LambdaQueryWrapper<PersonaDoc>()
                .eq(PersonaDoc::getPersonaId, personaId));
        if (links.isEmpty()) {
            return List.of();
        }
        return knowledgeService.listViewsByIds(links.stream().map(PersonaDoc::getDocId).toList());
    }

    private void requireUserId(Long userId) {
        if (userId == null) {
            throw new BusinessException("userId 不能为空");
        }
    }
}
