"use strict";
const el=id=>document.getElementById(id);
const stores=[["arc","Arc Supply"],["field","Field Press"]];
let rows=[],tab="keep",busy=false;
const normalize=text=>text.toLowerCase().replace(/t[ -]?shirts?/g,"tshirt");
const element=(type,text)=>{const node=document.createElement(type);node.textContent=text;return node};
async function documentAt(url){const res=await fetch(url);if(!res.ok)throw Error("页面读取失败 "+res.status);return new DOMParser().parseFromString(await res.text(),"text/html")}
function modal(title,nodes){el("modalTitle").textContent=title;el("content").replaceChildren(...nodes);el("modal").showModal()}
function showProof(row){
  const image=new Image();image.className="proof";image.src=row.url;image.alt=row.caption;
  const source=element("a","打开样店商品页");source.href=row.source;source.target="_blank";source.rel="noopener noreferrer";
  const nodes=[image,element("p","判定："+row.reason),element("p","图片线索："+(row.caption||"无说明")+" · "+row.filename),element("p","来源："+row.store),source];
  if(row.kind!=="skip"){
    const action=element("button",row.kind==="review"?"我确认是正面单品":"从采集包排除");action.className="outline";
    action.onclick=()=>{const warning=markReviewed(rows,row,row.kind==="review");el("modal").close();el("packStatus").textContent=warning||"已更新人工复核结果。";draw()};nodes.push(element("p","人工复核只影响本次任务。"),action);
  }
  modal(row.product,nodes);
}
function draw(){
  document.querySelectorAll("[data-tab]").forEach(button=>{const key=button.dataset.tab;button.setAttribute("aria-pressed",String(key===tab));button.querySelector("b").textContent=rows.filter(row=>row.kind===key).length});
  el("pack").disabled=busy||!rows.some(row=>row.kind==="keep");
  const cards=rows.filter(row=>row.kind===tab).map(row=>{
    const button=element("button","");button.className="card";const img=new Image();img.src=row.url;img.alt=row.caption;const label=element("div","");
    label.append(element("small",row.store.toUpperCase()),element("b",row.product),element("span",row.reason));button.append(img,label);button.onclick=()=>showProof(row);return button;
  });
  if(!cards.length){const empty=element("p",busy?"正在读取示例店铺…":"这一栏没有图片。可以换个关键词或查看其他分类。");empty.className="empty";cards.push(empty)}
  el("gallery").replaceChildren(...cards);
}
async function collect(){
  const query=el("keyword").value.trim();if(!query||busy)return;
  busy=true;el("run").disabled=true;el("packStatus").textContent="";tab="keep";rows=[];draw();const matches=new Map(),found=[];
  try{
    const terms=normalize(query).split(/\s+/);
    for(const [slug,store] of stores){
      const url=new URL("shop/"+slug+"/search.html",document.baseURI);url.searchParams.set("q",query);
      const doc=await documentAt(url);for(const link of readCatalog(doc,url.href,query))if(terms.every(term=>normalize(link.title).includes(term)))matches.set(link.url,{...link,store});
    }
    for(const product of matches.values()){
      el("message").textContent="正在读取 "+product.store+" 的商品页…";
      const doc=await documentAt(product.url);found.push(...readProduct(doc,product.url).map(row=>({...row,store:product.store})));
    }
    rows=decide(found);el("message").textContent="「"+query+"」 · 2 家样店 / "+matches.size+" 个商品 / "+rows.length+" 张候选图。点图片查看判断依据。";
  }catch(error){el("message").textContent="未能完成采集："+error.message}
  finally{busy=false;el("run").disabled=false;draw()}
}
document.querySelectorAll("[data-tab]").forEach(button=>button.onclick=()=>{tab=button.dataset.tab;draw()});
document.querySelectorAll("[data-query]").forEach(button=>button.onclick=()=>{if(!busy){el("keyword").value=button.dataset.query;collect()}});
el("search").onsubmit=event=>{event.preventDefault();collect()};
el("try").onclick=()=>{el("desk").scrollIntoView({block:"start"});el("keyword").focus({preventScroll:true})};
el("pack").onclick=async()=>{if(busy)return;busy=true;el("run").disabled=true;draw();try{const result=await exportPack(rows,msg=>el("packStatus").textContent=msg);el("packStatus").textContent="采集包已生成："+result.saved+" 张原图，"+result.failed+" 张下载失败。内含来源和判定清单。"}catch(error){el("packStatus").textContent=error.message}finally{busy=false;el("run").disabled=false;draw()}};
el("install").onclick=()=>{
  const zip=element("a","下载浏览器扩展 ZIP");zip.className="primary";zip.href="frontdesk-extension.zip";zip.download="frontdesk-extension.zip";
  modal("在自己的浏览器里采集",[element("p","① 下载并解压扩展。在 Chrome 或 Edge 的扩展管理页打开「开发者模式」，选择「加载已解压的扩展」。"),element("p","② 点扩展图标，输入关键词与店铺搜索入口。工具打开搜索页，列出待访问的商品链接；确认商家范围后，依次采图。"),element("p","③ 下载 ZIP，只打包规则命中的图。只在允许采集的页面使用；不绕过登录、验证码或站点限制。"),zip]);
};
el("info").onclick=()=>modal("作品一 · 商家正面图采集",[element("p","面向 Temu POD 商家的选款工作：找商品、进详情页、排除模特照和细节图，再保存带来源的素材。"),element("p","网页演示使用两家自建样店与原创示意图。Chrome 扩展可读取真实商店。图片未注明角度时，扩展会在本机用 AI 辨别正面，连同商品来源一起保存。"),element("p","产品场景与规则定义：王健斌。此处展示的是可运行的新作品版本，不是商家后台或业绩证明。")]);
el("close").onclick=()=>el("modal").close();collect();
