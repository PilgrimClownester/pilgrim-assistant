import { useEffect, useMemo, useRef, useState } from 'react';
import { getEdgeAILearningProgress, updateEdgeAIStage } from '../../api/client';
import './EdgeAILearning.css';

type Stage = {
  id: string; group: string; number: number; title: string;
  goal: string; topics: string[]; resource: string; questions: string[]; output: string;
};

const stages: Stage[] = [
  { id:'stage-1', group:'AI 计算基础', number:1, title:'神经网络与推理基础', goal:'建立从模型结构到推理计算路径的基本认知，能够用硬件视角描述一次前向传播。', topics:['Tensor','Layer','Weight','Activation','Training','Inference'], resource:'《动手学深度学习》2–4 章', questions:['神经网络本质上计算什么？','Training 和 Inference 有什么区别？','为什么推理阶段权重可以固定？','为什么 AI 推理适合硬件加速？'], output:'神经网络计算流程图' },
  { id:'stage-2', group:'AI 计算基础', number:2, title:'CNN 计算与硬件需求', goal:'完成卷积层计算量与数据复用分析，理解 CNN 为何适合并行硬件。', topics:['Convolution','Feature Map','Kernel','Channel','MAC'], resource:'D2L 7–8 章 · LeNet · AlexNet', questions:['卷积为什么计算量巨大？','CNN 为什么适合并行计算？','为什么 AI 计算大量使用 MAC？','为什么 Weight 需要复用？'], output:'CNN 层计算分析' },
  { id:'stage-3', group:'AI 计算基础', number:3, title:'Transformer 与 Edge AI 挑战', goal:'识别 Transformer 的计算与存储瓶颈，并建立端侧部署问题清单。', topics:['Attention','Q / K / V','KV Cache'], resource:'D2L 11 章 · Illustrated Transformer', questions:['Transformer 和 CNN 计算有什么区别？','为什么 Transformer 更加依赖 Memory？','为什么大模型难以直接部署到端侧？','为什么 Edge AI 需要硬件优化？'], output:'为什么未来需要 Edge AI' },
  { id:'stage-4', group:'AI 计算基础', number:4, title:'AI 计算生态', goal:'从并行性、存储层次和能效三个维度比较 CPU、GPU 与 NPU。', topics:['CPU','GPU','NPU'], resource:'TPU · Apple Neural Engine · 达芬奇', questions:['CPU 为什么不适合大量 AI 计算？','GPU 为什么适合 AI？','NPU 相比 CPU 优化在哪里？','Edge AI 未来有哪些应用？'], output:'CPU / GPU / NPU 对比表' },
  { id:'stage-5', group:'Accelerator 架构', number:5, title:'AI Accelerator 基本结构', goal:'能够解释计算阵列、片上缓存与控制模块之间的数据运动关系。', topics:['MAC','PE','Buffer','Accelerator'], resource:'DianNao 论文', questions:['为什么需要 AI Accelerator？','AI Accelerator 相比 CPU 优化在哪里？','MAC 为什么成为核心计算单元？','为什么需要 Buffer？'], output:'AI Accelerator 结构图' },
  { id:'stage-6', group:'Accelerator 架构', number:6, title:'NPU 计算架构', goal:'理解脉动阵列的时空映射，并能分析阵列利用率受限的原因。', topics:['Matrix Unit','Systolic Array','Dataflow'], resource:'TPU 性能分析论文', questions:['TPU 为什么使用矩阵阵列？','Systolic Array 如何工作？','为什么增加计算单元不一定提升性能？','数据流为什么重要？'], output:'TPU 结构分析图' },
  { id:'stage-7', group:'Accelerator 架构', number:7, title:'Memory 与数据流', goal:'建立存储层次、数据搬运能耗与 Dataflow 选择之间的因果关系。', topics:['Memory hierarchy','Data reuse','Weight Stationary','Output Stationary'], resource:'Eyeriss 论文', questions:['为什么 Memory 影响 AI 性能？','为什么数据搬运耗能？','为什么需要片上 Buffer？','什么是 Dataflow？'], output:'Accelerator Memory 结构' },
  { id:'stage-8', group:'Accelerator 架构', number:8, title:'FPGA 实现与 SoC 集成', goal:'形成一个包含计算、存储、互连和软件控制路径的完整 AI SoC 方案。', topics:['AXI','DMA','BRAM','DDR','CPU Interface'], resource:'Vitis AI · AXI4 · NVDLA', questions:['AI Accelerator 如何连接 CPU？','DMA 为什么重要？','FPGA 为什么适合验证 AI 架构？','一个简单 AI SoC 有哪些模块？'], output:'RISC-V + AI Accelerator 框图' },
  { id:'stage-9', group:'科研能力培养', number:9, title:'经典论文分析', goal:'建立“问题—方法—创新—指标”的论文分析模板，并比较三条经典路线。', topics:['问题','方法','创新','指标'], resource:'DianNao · TPU · Eyeriss', questions:['三篇论文分别解决什么问题？','AI Accelerator 发展路线是什么？','什么叫架构创新？'], output:'经典论文分析表' },
  { id:'stage-10', group:'科研能力培养', number:10, title:'现代 Edge AI 论文阅读', goal:'独立完成一篇现代论文的结构化阅读，并判断其真实贡献与局限。', topics:['Edge AI','RISC-V','Transformer'], resource:'阅读 1 篇 2020 年以后论文', questions:['当前 Edge AI 最大瓶颈是什么？','当前论文主要优化什么？','哪些方向适合硕士研究？'], output:'Edge AI 研究方向总结' },
  { id:'stage-11', group:'科研能力培养', number:11, title:'个人研究方向选择', goal:'把个人能力、首篇论文可行性与就业方向收敛为可执行的研究选择。', topics:['AI Accelerator','RISC-V AI SoC','Memory 优化','CPU-NPU 协同'], resource:'结合个人优势与就业方向', questions:['我的优势在哪里？','哪些方向适合第一篇论文？','哪些方向符合未来就业？'], output:'研究方向选择报告' },
  { id:'stage-12', group:'科研能力培养', number:12, title:'毕业设计预研', goal:'形成问题明确、架构完整、可在 FPGA 上验证的毕业设计最小方案。', topics:['系统架构','创新点','FPGA 验证'], resource:'Edge AI SoC 论文 · FPGA 项目', questions:['我要解决什么问题？','系统架构是什么？','创新点在哪里？','如何 FPGA 验证？','如何形成论文？'], output:'毕业设计方案' },
];

export default function EdgeAILearning() {
  const [completed, setCompleted] = useState<string[]>([]);
  const [active, setActive] = useState(0);
  const [saving, setSaving] = useState<string | null>(null);
  const touchStart = useRef<{ x:number; y:number } | null>(null);
  const completedSet = useMemo(() => new Set(completed), [completed]);

  useEffect(() => {
    getEdgeAILearningProgress().then((state) => {
      setCompleted(state.completed);
      const next = stages.findIndex((stage) => !state.completed.includes(stage.id));
      setActive(next < 0 ? stages.length - 1 : next);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    const useCache = (event: Event) => setCompleted((event as CustomEvent<{ completed:string[] }>).detail.completed);
    window.addEventListener('firefly:edge-ai-cache', useCache);
    return () => window.removeEventListener('firefly:edge-ai-cache', useCache);
  }, []);

  const toggle = async (stage: Stage) => {
    const done = !completedSet.has(stage.id);
    setCompleted((current) => done ? [...current, stage.id] : current.filter((id) => id !== stage.id));
    setSaving(stage.id);
    try {
      const state = await updateEdgeAIStage(stage.id, done);
      setCompleted(state.completed);
      if (done) {
        const next = stages.findIndex((item, index) => index > stage.number - 1 && !state.completed.includes(item.id));
        if (next >= 0) setActive(next);
      }
    } catch {
      setCompleted((current) => done ? current.filter((id) => id !== stage.id) : [...current, stage.id]);
    } finally { setSaving(null); }
  };

  const progress = Math.round(completed.length / stages.length * 100);
  const move = (delta: number) => setActive((current) => (current + delta + stages.length) % stages.length);

  return <section className="edge-learning" aria-label="Edge AI Learning 八月学习规划">
    <header className="edge-learning-head">
      <div><span>EDGE AI LEARNING · AUGUST</span><h3>从模型计算，到端侧系统</h3><p>12 个阶段 × 每阶段 2 天 · AI Model → Accelerator → Edge AI System</p></div>
      <div className="edge-progress"><strong>{completed.length}<small> / 12</small></strong><span>本月完成</span><i><b style={{width:`${progress}%`}} /></i></div>
    </header>

    <div className="edge-desktop-plan">
      {['AI 计算基础','Accelerator 架构','科研能力培养'].map((group) => <div className="edge-phase" key={group}>
        <div className="edge-phase-label"><span>{group}</span><small>{stages.filter((stage) => stage.group === group).length} STAGES</small></div>
        <div className="edge-phase-stages">{stages.filter((stage) => stage.group === group).map((stage) =>
          <StageCard key={stage.id} stage={stage} done={completedSet.has(stage.id)} saving={saving === stage.id} onToggle={() => toggle(stage)} />
        )}</div>
      </div>)}
    </div>

    <div className="edge-mobile-plan" onTouchStart={(event) => { const touch=event.touches[0]; touchStart.current={x:touch.clientX,y:touch.clientY}; }} onTouchEnd={(event) => { const start=touchStart.current; const touch=event.changedTouches[0]; touchStart.current=null; if(!start)return; const dx=touch.clientX-start.x; const dy=touch.clientY-start.y; if(Math.abs(dx)>48 && Math.abs(dx)>Math.abs(dy)*1.2) move(dx<0 ? 1 : -1); }}>
      <div className="edge-mobile-nav"><button onClick={() => move(-1)} aria-label="上一个阶段">←</button><span>STAGE {active + 1} / 12</span><button onClick={() => move(1)} aria-label="下一个阶段">→</button></div>
      <StageCard key={stages[active].id} stage={stages[active]} done={completedSet.has(stages[active].id)} saving={saving === stages[active].id} onToggle={() => toggle(stages[active])} expandedQuestions />
      <div className="edge-dots">{stages.map((stage,index) => <button key={stage.id} aria-label={`切换到阶段 ${index+1}`} onClick={() => setActive(index)} className={`${index === active ? 'is-active ' : ''}${completedSet.has(stage.id) ? 'is-done' : ''}`} />)}</div>
    </div>
  </section>;
}

function StageCard({ stage, done, saving, onToggle, expandedQuestions=false }: { stage:Stage; done:boolean; saving:boolean; onToggle:()=>void; expandedQuestions?:boolean }) {
  return <article className={`edge-stage-card${done ? ' is-done' : ''}`}>
    <div className="edge-stage-top"><span>{String(stage.number).padStart(2,'0')}</span><div className="edge-stage-meta"><time>预计 2 天</time><em>{done ? '已完成' : '待完成'}</em></div></div>
    <small>{stage.group}</small><h4>{stage.title}</h4>
    <section className="edge-stage-goal"><span>本阶段目标</span><p>{stage.goal}</p></section>
    <div className="edge-tags">{stage.topics.map((topic) => <i key={topic}>{topic}</i>)}</div>
    <dl><div><dt>RESEARCH MATERIAL</dt><dd>{stage.resource}</dd></div></dl>
    <details className="edge-questions" open={expandedQuestions}><summary>掌握标准 / 思考挑战 <span>{stage.questions.length}</span></summary><ol>{stage.questions.map((question) => <li key={question}>{question}</li>)}</ol></details>
    <section className="edge-deliverable"><span>STAGE DELIVERABLE</span><small>阶段成果</small><strong>{stage.output}</strong></section>
    <button className="edge-complete" disabled={saving} onClick={onToggle}><i>{done ? '✓' : ''}</i><span>{done ? '已完成 · 点击恢复' : '完成这一阶段'}</span></button>
  </article>;
}
