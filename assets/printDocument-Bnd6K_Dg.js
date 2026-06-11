function u(n){return String(n??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;")}function x(n){const e=n.rows,i=e.length?Array.from(new Set(e.flatMap(t=>Object.keys(t)))):["Aucune donnee disponible"],o=e.length?e:[{[i[0]]:""}];return`
    <h2>${u(n.name)}</h2>
    <table>
      <thead>
        <tr>${i.map(t=>`<th>${u(t)}</th>`).join("")}</tr>
      </thead>
      <tbody>
        ${o.map(t=>`<tr>${i.map(r=>`<td>${u(t[r])}</td>`).join("")}</tr>`).join("")}
      </tbody>
    </table>
  `}function v(n,e){const i=`
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          body { font-family: Arial, sans-serif; }
          h2 { margin: 20px 0 8px; font-size: 16px; }
          table { border-collapse: collapse; margin-bottom: 24px; }
          th, td { border: 1px solid #94a3b8; padding: 6px 8px; mso-number-format:"\\@"; }
          th { background: #0f766e; color: #ffffff; font-weight: 700; }
        </style>
      </head>
      <body>${e.map(x).join("")}</body>
    </html>
  `,o=new Blob([i],{type:"application/vnd.ms-excel;charset=utf-8"}),t=URL.createObjectURL(o),r=document.createElement("a");r.href=t,r.download=n.endsWith(".xls")?n:`${n.replace(/\.xlsx$/i,"")}.xls`,document.body.appendChild(r),r.click(),r.remove(),URL.revokeObjectURL(t)}function k(n){var w;const e=document.createElement("iframe");e.setAttribute("aria-hidden","true"),e.style.position="fixed",e.style.right="0",e.style.bottom="0",e.style.width="0",e.style.height="0",e.style.border="0",e.style.opacity="0",e.style.pointerEvents="none",document.body.appendChild(e);const i=()=>{window.setTimeout(()=>{e.remove()},300)},o=e.contentWindow,t=e.contentDocument??(o==null?void 0:o.document);if(!o||!t){i();return}t.open(),t.write(n),t.close();const r=Promise.all(Array.from(t.images).map(async a=>{try{const s=new URL(a.currentSrc||a.src,window.location.href);if(s.origin!==window.location.origin||s.protocol.startsWith("data"))return;const d=await fetch(s.toString(),{cache:"force-cache"});if(!d.ok)return;const m=await d.blob(),p=await new Promise((g,y)=>{const l=new FileReader;l.onload=()=>typeof l.result=="string"?g(l.result):y(new Error("Image non lisible.")),l.onerror=()=>y(l.error??new Error("Image non lisible.")),l.readAsDataURL(m)});a.src=p}catch{}})),c=(a,s)=>new Promise(d=>{let m=!1;const p=()=>{m||(m=!0,d())};window.setTimeout(p,s),a.finally(p)}),f=Promise.all(Array.from(t.images).map(a=>a.complete?Promise.resolve():new Promise(s=>{a.addEventListener("load",()=>s(),{once:!0}),a.addEventListener("error",()=>s(),{once:!0})}))),h=()=>{o.focus(),o.print(),o.addEventListener("afterprint",i,{once:!0}),window.setTimeout(i,2e3)},b=(w=t.fonts)==null?void 0:w.ready;if(b){Promise.all([c(b.catch(()=>{}),450),c(r,650),c(f,650)]).finally(()=>{window.setTimeout(h,60)});return}Promise.all([c(r,650),c(f,650)]).finally(()=>{window.setTimeout(h,80)})}export{v as e,k as p};
