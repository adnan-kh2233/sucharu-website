const API=window.SUCHARU_API_URL||"https://sucharu-api.onrender.com/api";
let token=localStorage.getItem("sucharuPartnerToken");
let partner=JSON.parse(localStorage.getItem("sucharuPartnerProfile")||"null");
const $=s=>document.querySelector(s);
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
async function api(path,options={}){
 const response=await fetch(API+path,{...options,headers:{"Content-Type":"application/json",...(token?{Authorization:`Bearer ${token}`}:{})}});
 const data=await response.json().catch(()=>({}));
 if(response.status===401){signOut();throw new Error(data.message||"Session expired. Sign in again.");}
 if(!response.ok)throw new Error(data.message||"Request failed");return data;
}
function showPortal(){if(!token||!partner){$("#loginView").hidden=false;$("#portalView").hidden=true;return;}$("#loginView").hidden=true;$("#portalView").hidden=false;$("#partnerName").textContent=partner.name;$("#partnerId").textContent=partner.partnerId;loadJobs();}
function signOut(){localStorage.removeItem("sucharuPartnerToken");localStorage.removeItem("sucharuPartnerProfile");token=null;partner=null;$("#loginView").hidden=false;$("#portalView").hidden=true;}
$("#loginForm").addEventListener("submit",async e=>{e.preventDefault();const form=Object.fromEntries(new FormData(e.currentTarget));$("#loginError").textContent="";try{const result=await api("/auth/partner/login",{method:"POST",body:JSON.stringify(form)});token=result.token;partner=result.partner;localStorage.setItem("sucharuPartnerToken",token);localStorage.setItem("sucharuPartnerProfile",JSON.stringify(partner));showPortal();}catch(error){$("#loginError").textContent=error.message;}});
$("#logout").onclick=signOut;$("#refresh").onclick=loadJobs;
const nextStep={assigned:["on_the_way","Mark on the way"],on_the_way:["service_started","Verify customer code & start"],service_started:["complete_report","Submit completion report"]};
async function loadJobs(){
 $("#jobs").innerHTML="<p>Loading bookings…</p>";
 try{const rows=await api("/partner/jobs");if(!rows.length){$("#jobs").innerHTML='<p class="empty">No active assigned bookings right now.</p>';return;}
  $("#jobs").innerHTML=rows.map(job=>{const step=nextStep[job.status],waiting=job.status==="awaiting_customer_confirmation",issue=job.status==="customer_issue_reported";return `<article class="job"><div><h3>${esc(job.service?.name||"Service")} <span class="badge">${esc((waiting?"Waiting for customer confirmation":issue?"Customer concern · contact Sucharu":job.status).replaceAll("_"," "))}</span></h3><p><b>${esc(job.bookingId)}</b> · ${esc(job.schedule?.date)} · ${esc(job.schedule?.time)}</p><p><b>Customer:</b> ${esc(job.customer?.name)} · <a href="tel:${esc(job.customer?.phone)}">${esc(job.customer?.phone)}</a></p><p><b>Address:</b> ${esc(job.area)}, ${esc(job.address)}</p>${job.note?`<p><b>Note:</b> ${esc(job.note)}</p>`:""}${waiting?"<p>The service report is waiting for customer confirmation. Refresh this page to check for updates.</p>":""}${issue?"<p>The customer raised a concern. Contact the Sucharu admin team for follow-up.</p>":""}</div>${step?`<button class="action" data-id="${esc(job.bookingId)}" data-status="${step[0]}">${step[1]}</button>`:waiting||issue?'<span class="badge">Pending follow-up</span>':'<span class="badge">Completed</span>'}</article>`;}).join("");
  document.querySelectorAll(".job .action").forEach(button=>button.onclick=async()=>{button.disabled=true;try{
   const id=encodeURIComponent(button.dataset.id),status=button.dataset.status;
   if(status==="service_started"){
    const code=prompt("Ask the customer to show the 6-digit service start code from their Sucharu app.");if(code===null){button.disabled=false;return;}
    await api(`/partner/jobs/${id}/start-service`,{method:"POST",body:JSON.stringify({code:code.trim()})});
   }else if(status==="complete_report"){
    if(!confirm("Confirm all three items: work completed as agreed, service area checked, and follow-up explained?")){button.disabled=false;return;}
    const notes=prompt("Optional completion note for the customer:")||"";
    await api(`/partner/jobs/${id}/complete`,{method:"POST",body:JSON.stringify({checklist:{workCompleted:true,areaChecked:true,followUpExplained:true},notes})});
   }else await api(`/partner/jobs/${id}/status`,{method:"PATCH",body:JSON.stringify({status})});
   await loadJobs();
  }catch(error){alert(error.message);button.disabled=false;}});
 }catch(error){$("#jobs").innerHTML=`<p class="empty">${esc(error.message)}</p>`;}
}
showPortal();
