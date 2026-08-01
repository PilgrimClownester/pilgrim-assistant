import { useEffect, useState } from 'react';
import { createIdea, deleteIdea, generateCreative, getIdeas, getRandomIdea } from '../../api/client';
import type { Idea } from '../../types';
import '../growth/GrowthView.css';
import './CreativeView.css';

type Mode = 'continue' | 'polish' | 'organize' | 'naming' | 'copy';
const modes: {id:Mode;label:string;hint:string}[] = [
  {id:'continue',label:'续写',hint:'延续你的语言节奏'}, {id:'polish',label:'润色',hint:'保留原意改善表达'}, {id:'organize',label:'碎片整理',hint:'口语整理成文章'}, {id:'naming',label:'起名',hint:'项目、文件或账号'}, {id:'copy',label:'短文案',hint:'简介与宣传语'},
];

function CreativeView() {
  const [tab,setTab] = useState<'write'|'ideas'>('write');
  const [mode,setMode] = useState<Mode>('polish');
  const [content,setContent] = useState(''); const [tone,setTone] = useState('自然'); const [iteration,setIteration] = useState('');
  const [answer,setAnswer] = useState(''); const [loading,setLoading] = useState(false);
  const [ideas,setIdeas] = useState<Idea[]>([]); const [ideaText,setIdeaText] = useState(''); const [review,setReview] = useState<Idea|null>(null);
  const loadIdeas = () => getIdeas().then((r) => setIdeas((r as {items:Idea[]}).items));
  useEffect(()=>{loadIdeas().catch(()=>{});},[]);
  const generate = async () => { if(!content.trim()) return; setLoading(true); try { const source = answer && iteration.trim() ? answer : content; const r = await generateCreative({mode,content:source,tone,iteration,keywords:[]}) as {answer:string}; setAnswer(r.answer); } finally { setLoading(false); } };
  const addIdea = async () => {if(!ideaText.trim())return; await createIdea({content:ideaText,category:'待分类',tags:[]});setIdeaText('');await loadIdeas();};
  const surprise = async () => {const r=await getRandomIdea() as {item:Idea|null};setReview(r.item);};
  return <main className="creative-page"><header className="creative-header"><div><span>CREATE WITH FIREFLY</span><h2>创作工坊</h2><p>保存火花，也陪一句话慢慢长成作品。</p></div><div className="creative-tabs"><button className={tab==='write'?'is-active':''} onClick={()=>setTab('write')}>写作陪练</button><button className={tab==='ideas'?'is-active':''} onClick={()=>setTab('ideas')}>灵感箱 <small>{ideas.length}</small></button></div></header>
  {tab==='write'?<><section className="mode-grid">{modes.map(item=><button key={item.id} className={mode===item.id?'is-active':''} onClick={()=>setMode(item.id)}><strong>{item.label}</strong><small>{item.hint}</small></button>)}</section><section className="writing-studio"><article><header><b>你的素材</b><select value={tone} onChange={e=>setTone(e.target.value)}><option>自然</option><option>正式</option><option>轻松</option><option>文艺</option><option>克制</option></select></header><textarea value={content} onChange={e=>setContent(e.target.value)} placeholder={mode==='naming'?'说明用途、关键词和风格偏好…':'把开头、原稿或碎碎念放在这里…'}/><input value={iteration} onChange={e=>setIteration(e.target.value)} placeholder="可选：本轮再调整什么，例如「更正式一点」"/><button className="creative-primary" onClick={generate} disabled={loading}>{loading?'流萤正在斟酌…':'开始生成'}</button></article><article><header><b>Firefly 的版本</b>{answer&&<button onClick={()=>navigator.clipboard.writeText(answer)}>复制</button>}</header><div className={`creative-result${answer?' has-content':''}`}>{answer||'结果会出现在这里。你仍然是作者，随时可以继续修改。'}</div></article></section></>:<section className="idea-studio"><article className="idea-capture"><textarea value={ideaText} onChange={e=>setIdeaText(e.target.value)} placeholder="记下一闪而过的点子…"/><div><button className="creative-primary" onClick={addIdea}>收进灵感箱</button><button onClick={surprise}>随机翻一条</button></div>{review&&<aside><small>旧火花 · {review.category}</small><p>{review.content}</p><button onClick={()=>{setContent(review.content);setTab('write');}}>拿它继续创作 →</button></aside>}</article><article className="idea-list">{ideas.slice().reverse().map(item=><div key={item.id}><header><b>{item.category}</b><button onClick={async()=>{await deleteIdea(item.id);loadIdeas();}}>×</button></header><p>{item.content}</p><footer>{item.tags.map(tag=><span key={tag}>#{tag}</span>)}<time>{new Date(item.created_at).toLocaleDateString()}</time></footer></div>)}</article></section>}
  </main>;
}
export default CreativeView;
