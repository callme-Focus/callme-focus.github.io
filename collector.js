"use strict";
function readCatalog(doc,base,keyword){
  const result=new Map();
  const terms=keyword.toLowerCase().replace(/t[ -]?shirts?/g,"tshirt").split(/\s+/).filter(Boolean);
  for(const link of doc.querySelectorAll("a[href]")){
    let url;try{url=new URL(link.getAttribute("href"),base)}catch{continue}
    if(!/^https?:$/.test(url.protocol)||url.username||url.password||url.pathname==="/"||link.closest("header,nav,footer"))continue;
    if(/\.(?:svg|png|jpe?g|gif|webp|pdf)\/?$/i.test(url.pathname)||/\/(?:search|cart|login|account|help)(?:\/|$)/i.test(url.pathname))continue;
    const title=(link.getAttribute("aria-label")||link.textContent.trim()||link.querySelector("img")?.alt||"").trim().slice(0,160);
    const known=/\/(?:product[s]?|item|itm|listing|dp|goods|p)\//i.test(url.pathname)||/-g-\d+\.html$/i.test(url.pathname);
    const label=(title+" "+url.pathname).toLowerCase().replace(/t[ -]?shirts?/g,"tshirt");
    if(!known&&!(link.querySelector("img")&&terms.length&&terms.some(term=>label.includes(term))))continue;
    url.hash="";for(const key of [...url.searchParams.keys()])if(/^utm_|^ref_$|^_trksid$/i.test(key))url.searchParams.delete(key);
    if(!result.has(url.href))result.set(url.href,{url:url.href,title:title||url.pathname.split("/").filter(Boolean).at(-1)});
    if(result.size>=80)break;
  }
  return [...result.values()];
}
function readProduct(doc,base){
  const heading=(doc.querySelector("h1")?.textContent||doc.title||"未命名商品").trim().slice(0,130);
  const galleries=[...doc.querySelectorAll("[data-product-gallery],product-gallery,media-gallery,[itemprop=image]:not(img),#altImages,#imageBlock,[class*=product-gallery i],[class*=product__media i],[class*=image-carousel i]")];
  const roots=galleries.length?galleries:[doc.querySelector("main")||doc.body];
  const images=new Map();
  for(const node of new Set(roots.flatMap(root=>[...root.querySelectorAll("img")]))){
    if(node.closest("nav,footer,header,aside,[class*=recommend i],[class*=related i],button[type=submit]"))continue;
    const src=node.getAttribute("data-zoom-image")||node.getAttribute("data-old-hires")||node.getAttribute("data-large")||node.getAttribute("data-src")||node.currentSrc||node.getAttribute("src");
    if(!src)continue;
    let url;try{url=new URL(src,base)}catch{continue}
    if(!/^https?:$/.test(url.protocol)||url.username||url.password||url.pathname==="/")continue;
    url.hash="";
    const caption=[node.getAttribute("alt"),node.getAttribute("title"),node.closest("figure")?.querySelector("figcaption")?.textContent,node.parentElement?.getAttribute("aria-label")].filter(Boolean).join(" · ").slice(0,320);
    let filename=url.pathname.split("/").pop();try{filename=decodeURIComponent(filename)}catch{}
    if(images.has(url.href)){const saved=images.get(url.href);if(caption&&!saved.caption.includes(caption))saved.caption+=" · "+caption;continue}
    images.set(url.href,{url:url.href,caption,filename,product:heading,source:base});
    if(images.size>=100)break;
  }
  return [...images.values()];
}
function classify(row){
  const words=(row.caption+" "+row.filename).replace(/([a-z])([A-Z])/g,"$1 $2").replace(/[_-]+/g," ").toLowerCase();
  const negatives=[
    [/模特|上身|穿搭|穿着|真人|人台|\b(?:models?|mannequin|lifestyle|worn|wearing|on body|on person)\b/,"模特或上身图"],
    [/背面|后视|背视|侧面|侧视|\b(?:back|rear|side|reverse|profile)(?:\s*view)?\b/,"背面或侧面"],
    [/特写|细节|局部|放大|\b(?:details?|close\s?up|macro|zoomed|crop(?:ped)?)\b/,"局部或细节图"],
    [/尺码|尺寸表|色卡|拼图|组合图|正反面|\b(?:size chart|swatch|collage|front and back|logo|icon|banner)\b/,"辅助图或拼图"]
  ];
  if(/\.svgz?(?:$|[?#])|[?&](?:fm|format)=svg\b/i.test(row.url))return {kind:"skip",reason:"不是商品位图"};
  for(const [pattern,reason] of negatives)if(pattern.test(words))return {kind:"skip",reason};
  const front=/正面|前视|前幅|正视|\bfront(?:\s*(?:view|side|facing))?\b/.test(words);
  const isolated=/平铺|单品|商品全貌|产品全貌|白底|挂拍|无人物|\b(?:flat\s?lay|packshot|product only|isolated|hanger|on white)\b/.test(words);
  if(front&&isolated)return {kind:"keep",reason:"正面角度 + 单品展示"};
  return {kind:"review",reason:front?"有正面线索，未确认是单品展示":isolated?"已确认单品，角度不明":"缺少角度与展示方式证据"};
}
function decide(rows){
  const already=new Set();
  return rows.map(row=>{
    const decision=classify(row);
    if(decision.kind==="keep"&&already.has(row.url))return {...row,kind:"skip",reason:"同一正面图链接已收录"};
    if(decision.kind==="keep")already.add(row.url);
    return {...row,...decision};
  });
}
function markReviewed(rows,row,accept){
  if(accept&&rows.some(item=>item!==row&&item.url===row.url&&item.kind==="keep"))return "该图片链接已在收录清单中。";
  row.kind=accept?"keep":"skip";row.reason=accept?"人工复核：确认正面单品":"人工复核：排除";return "";
}
function manifestCSV(rows){
  const keys=["product","source","url","caption","kind","reason","model","visual_class","visual_margin","visual_views","file","error"];
  const cell=value=>{const text=String(value??"");return '"'+(/^[\s]*[=+@-]/.test(text)?"'":"")+text.replaceAll('"','""')+'"'};
  return "\uFEFF"+[keys.join(","),...rows.map(row=>keys.map(key=>cell(row[key])).join(","))].join("\r\n");
}
function downloadBlob(blob,name){const href=URL.createObjectURL(blob),anchor=document.createElement("a");anchor.href=href;anchor.download=name;anchor.click();setTimeout(()=>URL.revokeObjectURL(href),30000)}
function storedZip(files){
  const encode=new TextEncoder(),parts=[],directory=[];
  const table=Array.from({length:256},(_,value)=>{for(let bit=0;bit<8;bit++)value=value&1?(value>>>1)^0xedb88320:value>>>1;return value>>>0});
  let cursor=0,dirSize=0;
  function head(size,fields){const bytes=new Uint8Array(size),view=new DataView(bytes.buffer);for(const [offset,value,width] of fields)view[width===4?"setUint32":"setUint16"](offset,value,true);return bytes}
  for(const file of files){
    const name=encode.encode(file.name),data=file.bytes;
    let crc=0xffffffff;for(const byte of data)crc=table[(crc^byte)&255]^(crc>>>8);crc=(crc^0xffffffff)>>>0;
    const local=head(30,[[0,0x04034b50,4],[4,20],[6,2048],[12,33],[14,crc,4],[18,data.length,4],[22,data.length,4],[26,name.length]]);
    const central=head(46,[[0,0x02014b50,4],[4,20],[6,20],[8,2048],[14,33],[16,crc,4],[20,data.length,4],[24,data.length,4],[28,name.length],[42,cursor,4]]);
    parts.push(local,name,data);directory.push(central,name);cursor+=30+name.length+data.length;dirSize+=46+name.length;
  }
  return new Blob([...parts,...directory,head(22,[[0,0x06054b50,4],[8,files.length],[10,files.length],[12,dirSize,4],[16,cursor,4]])],{type:"application/zip"});
}
async function imageBytes(url){
  const response=await fetch(url,{credentials:new URL(url).origin===location.origin?"same-origin":"omit",redirect:"error",signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw Error("读取失败 HTTP "+response.status);
  const reader=response.body.getReader(),chunks=[];let size=0;
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>8*1024*1024){await reader.cancel();throw Error("单图超过 8 MB")}chunks.push(value)}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length}
  const sig=String.fromCharCode(...bytes.slice(0,12));
  const ext=sig.startsWith("\x89PNG\r\n\x1a\n")?"png":bytes[0]===255&&bytes[1]===216&&bytes[2]===255?"jpg":sig.startsWith("RIFF")&&sig.endsWith("WEBP")?"webp":null;
  if(!ext)throw Error("不是支持的 PNG / JPEG / WebP 位图");
  return {bytes,ext};
}
async function exportPack(rows,report){
  const files=[],manifest=[],chosen=rows.filter(row=>row.kind==="keep");let size=0;
  for(const row of rows){
    const record={...row};manifest.push(record);if(record.kind!=="keep")continue;
    try{
      if(size>=64*1024*1024)throw Error("已达单包 64 MB 上限");
      const {bytes,ext}=await imageBytes(row.url);
      if(size+bytes.length>64*1024*1024)throw Error("已达单包 64 MB 上限");
      const file="images/"+String(files.length+1).padStart(3,"0")+"-front."+ext;files.push({name:file,bytes});record.file=file;size+=bytes.length;
    }catch(error){record.error=error.message}
    report?.("已处理 "+manifest.filter(item=>item.kind==="keep").length+" / "+chosen.length+" 张正面图");
  }
  const saved=files.length;
  files.push({name:"sources.csv",bytes:new TextEncoder().encode(manifestCSV(manifest))});
  downloadBlob(storedZip(files),"frontdesk-正面商品图.zip");
  return {saved,failed:chosen.length-saved};
}
