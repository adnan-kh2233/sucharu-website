const API = window.SUCHARU_API_URL || "https://sucharu-api.onrender.com/api";
let token = localStorage.getItem("sucharuAdminToken");
const $ = s => document.querySelector(s);
const escapeHTML = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

function headers(){return {"Content-Type":"application/json","Authorization":"Bearer "+token}}
async function api(path, opts={}) {
  const r = await fetch(API+path, {...opts, headers:{...headers(), ...(opts.headers||{})}});
  const data = await r.json().catch(()=>({}));
  if(r.status===401||r.status===403){token=null;localStorage.removeItem("sucharuAdminToken");showLogin();$("#loginError").textContent=data.message||"Admin session expired. Please sign in again.";throw new Error(data.message||"Admin sign-in required.")}
  if(!r.ok) throw new Error(data.message||"Request failed");
  return data;
}
function showApp(){ $("#loginView").hidden=true; $("#app").hidden=false; loadDashboard(); }
function showLogin(){ $("#loginView").hidden=false; $("#app").hidden=true; }

$("#loginForm").addEventListener("submit", async e=>{
  e.preventDefault();
  const d=Object.fromEntries(new FormData(e.target));
  try{
    const r=await fetch(API+"/auth/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(d)});
    const data=await r.json(); if(!r.ok) throw new Error(data.message);
    token=data.token; localStorage.setItem("sucharuAdminToken",token); showApp();
  }catch(err){$("#loginError").textContent=err.message}
});
$("#logout").onclick=()=>{localStorage.removeItem("sucharuAdminToken");token=null;showLogin()};

document.querySelectorAll("aside [data-tab]").forEach(b=>b.onclick=()=>{
  document.querySelectorAll(".tab").forEach(x=>x.hidden=true);
  $("#"+b.dataset.tab).hidden=false;
  $("#title").textContent=b.textContent;
  if(b.dataset.tab==="dashboard")loadDashboard();
  if(b.dataset.tab==="bookings")loadBookings();
  if(b.dataset.tab==="partners")loadPartners();
  if(b.dataset.tab==="services")loadServices();
});

async function loadDashboard(){
  try{
    const d=await api("/dashboard/summary");
    $("#summaryCards").innerHTML=[
      ["Bookings",d.bookings],["Active Partners",d.activePartners],["Active Services",d.activeServices],
      ["Completed Service Value (est.)",`৳${Number(d.completedServiceValue||0).toLocaleString()}`]
    ].map(x=>`<div class="card"><strong>${x[1]}</strong><span>${x[0]}</span></div>`).join("");
    $("#statusList").innerHTML=(d.statusCounts||[]).map(x=>`<div class="status-row"><span>${escapeHTML(x._id)}</span><b>${Number(x.count)||0}</b></div>`).join("");
  }catch(e){if(token)$("#apiState").textContent="● API offline"}
}
async function loadBookings(){
  try{
    const [rows,partners]=await Promise.all([api("/bookings"),api("/partners")]);
    const eligible=partners.filter(p=>p.status==="active"&&p.verificationStatus==="verified");
    const norm=value=>String(value||"").trim().toLocaleLowerCase("en");
    const normCategory=value=>{
      const category=norm(value).replace(/[._-]+/g," ").replace(/\s+/g," ");
      if(["electrician","electrical","electrical repair","electrical services","electrical service"].includes(category))return "electrical";
      if(["plumber","plumbing","plumbing repair"].includes(category))return "plumbing";
      if(["ac technician","ac service","ac services","ac servicing"].includes(category))return "ac services";
      return category;
    };
    const normArea=value=>{
      const area=norm(value).replace(/[._-]+/g," ").replace(/\s+/g," ");
      if(["sodor","sadar","khulna sadar","khulna sodor"].includes(area))return "khulna sadar";
      if(["khalispur","khalishpur"].includes(area))return "khalishpur";
      return area;
    };
    $("#bookingRows").innerHTML=rows.map(b=>{
      const currentId=String(b.partner?.partnerId||"");
      const matching=eligible.filter(p=>
        (p.category||[]).some(c=>[b.service?.category,b.service?.name].some(s=>normCategory(c)===normCategory(s)))&&
        (!(p.area||[]).length||(p.area||[]).some(a=>normArea(a)===normArea(b.area)))
      );
      const current=partners.find(p=>String(p._id)===currentId);
      if(current&&!matching.some(p=>String(p._id)===currentId))matching.unshift(current);
      const options=[`<option value="">Unassigned</option>`,...matching.map(p=>`<option value="${escapeHTML(p._id)}" ${String(p._id)===currentId?"selected":""}>${escapeHTML(p.name)} — ${escapeHTML(p.partnerId)}</option>`)].join("");
      const canAssign=["booking_received","confirmed","assigned"].includes(b.status);
      return `<tr>
      <td><b>${escapeHTML(b.bookingId)}</b></td><td>${escapeHTML(b.customer?.name)}<br>${escapeHTML(b.customer?.phone)}</td><td>${escapeHTML(b.service?.name)}</td>
      <td>${escapeHTML(b.schedule?.date||"-")}<br>${escapeHTML(b.schedule?.time||"-")}</td><td><span class="badge">${escapeHTML(b.status)}</span></td>
      <td><div class="inline-controls"><select class="booking-partner" aria-label="Partner for ${escapeHTML(b.bookingId)}" ${canAssign?"":"disabled"}>${options}</select><button class="action assign-partner" data-booking-id="${escapeHTML(b.bookingId)}" ${canAssign?"":"disabled"}>Save</button></div></td>
      <td><button class="action" onclick="changeStatus('${escapeHTML(b.bookingId)}',this)">Update status</button></td></tr>`;
    }).join("");
    $("#bookingRows").querySelectorAll(".assign-partner").forEach(button=>button.onclick=async()=>{
      const row=button.closest("tr");
      const partnerId=row.querySelector(".booking-partner").value;
      try{await api(`/bookings/${encodeURIComponent(button.dataset.bookingId)}/partner`,{method:"PATCH",body:JSON.stringify({partnerId})});await loadBookings();await loadDashboard();}
      catch(error){alert(error.message)}
    });
  }catch(error){$("#bookingRows").innerHTML=`<tr><td colspan="7">${escapeHTML(error.message)}</td></tr>`}
}
async function changeStatus(id,button){
  const statusSelect=button.parentElement.querySelector(".booking-status");
  if(!statusSelect){
    const currentStatus=button.closest("tr").querySelector(".badge")?.textContent||"booking_received";
    const select=document.createElement("select");
    select.className="booking-status";
    select.setAttribute("aria-label",`Status for ${id}`);
    ["booking_received","confirmed","assigned","on_the_way","service_started","completed","cancelled"].forEach(status=>{
      const option=document.createElement("option");
      option.value=status;
      option.textContent=status.replaceAll("_"," ");
      option.selected=status===currentStatus;
      select.append(option);
    });
    button.before(select);
    button.textContent="Save status";
    return;
  }
  try{
    button.disabled=true;
    await api(`/bookings/${encodeURIComponent(id)}/status`,{method:"PATCH",body:JSON.stringify({status:statusSelect.value})});
    await loadBookings();
    await loadDashboard();
  }catch(error){alert(error.message);button.disabled=false;}
}
async function loadPartners(){
  try{
    const rows=await api("/partners");
    const verifications=["pending","in_review","verified","rejected"];
    const statuses=["inactive","active","suspended"];
    $("#partnerRows").innerHTML=rows.map(p=>{
      const id=escapeHTML(p._id);
      const verificationOptions=verifications.map(value=>`<option value="${value}" ${p.verificationStatus===value?"selected":""}>${value.replace("_"," ")}</option>`).join("");
      const statusOptions=statuses.map(value=>`<option value="${value}" ${p.status===value?"selected":""} ${value==="active"&&p.verificationStatus!=="verified"?"disabled":""}>${value}</option>`).join("");
      return `<tr data-partner-id="${id}"><td>${escapeHTML(p.partnerId)}</td><td>${escapeHTML(p.name)}</td><td>${escapeHTML(p.phone)}</td><td>${escapeHTML((p.category||[]).join(", "))}</td>
        <td><select class="partner-verification" aria-label="Verification status for ${escapeHTML(p.name)}">${verificationOptions}</select></td>
        <td><select class="partner-status" aria-label="Partner status for ${escapeHTML(p.name)}">${statusOptions}</select></td>
        <td><button class="action portal-access" ${p.status!=="active"||p.verificationStatus!=="verified"?"disabled":""}>${p.portalEnabled?"Reset password":"Set password"}</button> ${p.portalEnabled?"Enabled":"Off"}</td>
        <td>${Number(p.completedJobs)||0}</td><td><button class="action save-partner">Save</button></td></tr>`;
    }).join("");
    $("#partnerRows").querySelectorAll("tr").forEach(row=>{
      const verification=row.querySelector(".partner-verification");
      const status=row.querySelector(".partner-status");
      const syncStatus=()=>{
        const activeOption=status.querySelector('option[value="active"]');
        activeOption.disabled=verification.value!=="verified";
        if(activeOption.disabled&&status.value==="active")status.value="inactive";
      };
      verification.addEventListener("change",syncStatus);
      syncStatus();
      row.querySelector(".save-partner").onclick=async()=>{
        try{
          await api(`/partners/${encodeURIComponent(row.dataset.partnerId)}`,{method:"PATCH",body:JSON.stringify({verificationStatus:verification.value,status:status.value})});
          await loadPartners();
          await loadBookings();
          await loadDashboard();
        }catch(error){alert(error.message)}
      };
      row.querySelector(".portal-access").onclick=()=>{
        if(status.value!=="active"||verification.value!=="verified"){alert("Verify and activate the partner first.");return;}
        const form=$("#portalForm");form.dataset.partnerId=row.dataset.partnerId;form.reset();$("#portalError").textContent="";$("#portalModal").hidden=false;
      };
    });
  }catch(error){$("#partnerRows").innerHTML=`<tr><td colspan="9">${escapeHTML(error.message)}</td></tr>`}
}
async function loadServices(){
  const rows=await api("/services?all=true");
  $("#serviceRows").innerHTML=rows.map(s=>{
    const quote=s.pricingModel==="quote";
    const customerPrice=Number(s.startingPrice||0),workerPayment=Number(s.workerPayment||0);
    return `<tr><td>${escapeHTML(s.icon||"")} ${escapeHTML(s.name)}</td><td>${escapeHTML(s.category)}</td><td>${quote?"Quote required":`৳${customerPrice}`}</td><td>${s.workerPayment==null?"—":`৳${workerPayment}`}</td><td class="margin">${quote||s.workerPayment==null?"—":`৳${customerPrice-workerPayment}`}</td><td>${s.active?"Yes":"No"}</td><td><button class="action" onclick="editService('${escapeHTML(s._id)}',${customerPrice},${workerPayment},'${escapeHTML(s.pricingModel)}')">Edit</button></td></tr>`;
  }).join("");
}
async function editService(id,c,w,currentModel="fixed"){
  if(!/^[a-f\d]{24}$/i.test(id))return;
  const pricingModel=prompt("Pricing model: fixed or quote",currentModel);
  if(pricingModel===null)return;
  if(!["fixed","quote"].includes(pricingModel)){alert("Enter fixed or quote.");return;}
  const worker=prompt("Partner payout estimate (BDT, optional; use 0 if not set)",w); if(worker===null)return;
  if(!Number.isFinite(Number(worker))||Number(worker)<0){alert("Enter a valid non-negative partner payout estimate.");return;}
  if(pricingModel==="quote"){
    try{await api("/services/"+id,{method:"PATCH",body:JSON.stringify({pricingModel:"quote",startingPrice:null,workerPayment:Number(worker)})});loadServices();}catch(err){alert(err.message)}
    return;
  }
  const customer=prompt("Customer price",c); if(customer===null)return;
  if(!Number.isFinite(Number(customer))||Number(customer)<0){alert("Enter a valid non-negative customer price estimate.");return;}
  try{await api("/services/"+id,{method:"PATCH",body:JSON.stringify({pricingModel:"fixed",startingPrice:Number(customer),workerPayment:Number(worker)})});loadServices();}catch(err){alert(err.message)}
}
$("#refreshBookings").onclick=loadBookings;$("#refreshServices").onclick=loadServices;
$("#newPartner").onclick=()=>$("#modal").hidden=false;$("#closeModal").onclick=()=>$("#modal").hidden=true;
$("#closePortalModal").onclick=()=>$("#portalModal").hidden=true;
$("#portalForm").addEventListener("submit",async e=>{
 e.preventDefault();const form=e.currentTarget;const password=new FormData(form).get("password");
 try{await api(`/partners/${encodeURIComponent(form.dataset.partnerId)}/portal-access`,{method:"PATCH",body:JSON.stringify({password})});$("#portalModal").hidden=true;await loadPartners();}
 catch(error){$("#portalError").textContent=error.message;}
});
$("#partnerForm").addEventListener("submit",async e=>{
 e.preventDefault();const f=new FormData(e.target);
 const body={name:f.get("name"),phone:f.get("phone"),category:f.get("category").split(",").map(x=>x.trim()).filter(Boolean),area:(f.get("area")||"").split(",").map(x=>x.trim()).filter(Boolean),experienceYears:Number(f.get("experienceYears")||0),hasTools:f.has("hasTools"),emergencyAvailable:f.has("emergencyAvailable")};
 try{await api("/partners",{method:"POST",body:JSON.stringify(body)});e.target.reset();$("#modal").hidden=true;loadPartners();}catch(err){alert(err.message)}
});
if(token)showApp();
