import { useEffect, useMemo, useState } from 'react';
import { getEdgeAILearningProgress, updateEdgeAIStage } from '../../api/client';
import './EdgeAILearning.css';

type Stage = {
  id: string; group: string; number: number; dates: string; title: string;
  topics: string[]; resource: string; output: string;
};

const stages: Stage[] = [
  { id:'stage-1', group:'AI 计算基础', number:1, dates:'8.01 — 8.02', title:'神经网络与推理基础', topics:['Tensor','Layer','Weight','Inference'], resource:'《动手学深度学习》2–4 章', output:'神经网络计算流程图' },
  { id:'stage-2', group:'AI 计算基础', number:2, dates:'8.03 — 8.04', title:'CNN 计算与硬件需求', topics:['Convolution','Feature Map','Kernel','MAC'], resource:'D2L 7–8 章 · LeNet · AlexNet', output:'CNN 层计算分析' },
  { id:'stage-3', group:'AI 计算基础', number:3, dates:'8.05 — 8.06', title:'Transformer 与 Edge AI 挑战', topics:['Attention','Q / K / V','KV Cache'], resource:'D2L 11 章 · Illustrated Transformer', output:'为什么未来需要 Edge AI' },
  { id:'stage-4', group:'AI 计算基础', number:4, dates:'8.07 — 8.08', title:'AI 计算生态', topics:['CPU','GPU','NPU'], resource:'TPU · Apple Neural Engine · 达芬奇', output:'CPU / GPU / NPU 对比表' },
  { id:'stage-5', group:'Accelerator 架构', number:5, dates:'8.09 — 8.11', title:'AI Accelerator 基本结构', topics:['MAC','PE','Buffer','Accelerator'], resource:'DianNao 论文', output:'AI Accelerator 结构图' },
  { id:'stage-6', group:'Accelerator 架构', number:6, dates:'8.12 — 8.14', title:'NPU 计算架构', topics:['Matrix Unit','Systolic Array','Dataflow'], resource:'TPU 性能分析论文', output:'TPU 结构分析图' },
  { id:'stage-7', group:'Accelerator 架构', number:7, dates:'8.15 — 8.17', title:'Memory 与数据流', topics:['Memory hierarchy','Data reuse','Stationary'], resource:'Eyeriss 论文', output:'Accelerator Memory 结构' },
  { id:'stage-8', group:'Accelerator 架构', number:8, dates:'8.18 — 8.20', title:'FPGA 实现与 SoC 集成', topics:['AXI','DMA','BRAM','DDR'], resource:'Vitis AI · AXI4 · NVDLA', output:'RISC-V + AI Accelerator 框图' },
  { id:'stage-9', group:'科研能力培养', number:9, dates:'8.21 — 8.23', title:'经典论文分析', topics:['问题','方法','创新','指标'], resource:'DianNao · TPU · Eyeriss', output:'经典论文分析表' },
  { id:'stage-10', group:'科研能力培养', number:10, dates:'8.24 — 8.26', title:'现代 Edge AI 论文阅读', topics:['Edge AI','RISC-V','Transformer'], resource:'2020 年后论文 1 篇', output:'Edge AI 研究方向总结' },
  { id:'stage-11', group:'科研能力培养', number:11, dates:'8.27 — 8.29', title:'个人研究方向选择', topics:['AI SoC','Memory 优化','CPU-NPU 协同'], resource:'结合个人优势与就业方向', output:'研究方向选择报告' },
  { id:'stage-12', group:'科研能力培养', number:12, dates:'8.30 — 8.31', title:'毕业设计预研', topics:['系统架构','创新点','FPGA 验证'], resource:'Edge AI SoC · FPGA 项目', output:'毕业设计方案' },
];

export default function EdgeAILearning() {
  const [completed, setCompleted] = useState<string[]>([]);
  const [active, setActive] = useState(0);
  const [saving, setSaving] = useState<string | null>(null);
  const completedSet = useMemo(() => new Set(completed), [completed]);

  useEffect(() => {
    getEdgeAILearningProgress().then((state) => {
      setCompleted(state.completed);
      const next = stages.findIndex((stage) => !state.completed.includes(stage.id));
      setActive(next < 0 ? stages.length - 1 : next);
    }).catch(() => {});
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
      <div><span>EDGE AI LEARNING · AUGUST</span><h3>从模型计算，到端侧系统</h3><p>12 个阶段 · AI Model → Accelerator → Edge AI System</p></div>
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

    <div className="edge-mobile-plan">
      <div className="edge-mobile-nav"><button onClick={() => move(-1)} aria-label="上一个阶段">←</button><span>STAGE {active + 1} / 12</span><button onClick={() => move(1)} aria-label="下一个阶段">→</button></div>
      <StageCard stage={stages[active]} done={completedSet.has(stages[active].id)} saving={saving === stages[active].id} onToggle={() => toggle(stages[active])} />
      <div className="edge-dots">{stages.map((stage,index) => <button key={stage.id} aria-label={`切换到阶段 ${index+1}`} onClick={() => setActive(index)} className={`${index === active ? 'is-active ' : ''}${completedSet.has(stage.id) ? 'is-done' : ''}`} />)}</div>
    </div>
  </section>;
}

function StageCard({ stage, done, saving, onToggle }: { stage:Stage; done:boolean; saving:boolean; onToggle:()=>void }) {
  return <article className={`edge-stage-card${done ? ' is-done' : ''}`}>
    <div className="edge-stage-top"><span>{String(stage.number).padStart(2,'0')}</span><time>{stage.dates}</time></div>
    <small>{stage.group}</small><h4>{stage.title}</h4>
    <div className="edge-tags">{stage.topics.map((topic) => <i key={topic}>{topic}</i>)}</div>
    <dl><div><dt>LEARN</dt><dd>{stage.resource}</dd></div><div><dt>OUTPUT</dt><dd>{stage.output}</dd></div></dl>
    <button className="edge-complete" disabled={saving} onClick={onToggle}><i>{done ? '✓' : ''}</i><span>{done ? '已完成 · 点击恢复' : '完成这一阶段'}</span></button>
  </article>;
}
