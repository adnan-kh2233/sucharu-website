import { initializeApp } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-app.js";
import { getAuth, getIdToken, onAuthStateChanged, signInWithCustomToken, signOut } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js";
import { firebaseConfig } from "./firebase-config.js";

const firebaseApp = initializeApp(firebaseConfig);
const firebaseAuth = getAuth(firebaseApp);
(() => {
  const API = window.SUCHARU_API_URL || "https://sucharu-api.onrender.com/api";
  const exampleCatalog = [
    {name:"Home Cleaning",category:"Cleaning",icon:"🧹",price:1500,description:"Starting estimate for a small home. Final price depends on size and scope."},
    {name:"Bathroom Cleaning",category:"Cleaning",icon:"🧽",price:1000,description:"Starting estimate for one bathroom. Final scope confirmed before service."},
    {name:"AC Servicing",category:"AC Services",icon:"❄️",price:1000,description:"Starting estimate for standard servicing. Parts and repair work cost extra with approval."},
    {name:"Electrical Repair",category:"Electrical Services",icon:"💡",price:500,description:"Starting visit/inspection estimate. Materials and repair scope confirmed first."},
    {name:"Plumbing Repair",category:"Plumbing",icon:"🔧",price:500,description:"Starting visit/inspection estimate. Parts and repair scope confirmed first."},
    {name:"Pest Control Consultation",category:"Pest Control",icon:"🛡️",price:1000,description:"Request a pest control assessment and treatment recommendation."},
    {name:"Home Shifting Consultation",category:"Moving and Shifting",icon:"📦",price:null,description:"Request a moving estimate. Price requires details and confirmation."}
  ];
  let catalog = [...exampleCatalog];
  const $ = s => document.querySelector(s);
  const storedProfile = (() => { try { return JSON.parse(localStorage.getItem("sucharuCustomerProfile") || "null"); } catch { return null; } })();
  let customerToken = localStorage.getItem("sucharuCustomerToken");
  let currentCustomer = storedProfile;
  let pendingService = null;
  let resetCodeRequested = false;
  let resetResendTimer = null;
  let addressMap = null, addressMarker = null, selectedAddressPin = null;
  const grid = $("#serviceGrid"), search = $("#serviceSearch"), filters = $("#categoryFilters");
  let activeCategory = "All";
  const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const money = n => n == null ? "Quote required" : `৳${Number(n).toLocaleString("en-BD")}`;
  function updateAccountButton(){
    const button=$("#accountButton");
    button.textContent=currentCustomer?`My account · ${currentCustomer.name.split(" ")[0]}`:"Sign in";
  }
  function showAccountView(){
    const signedIn=Boolean(customerToken&&currentCustomer);
    $("#accountSignedOut").hidden=signedIn;
    $("#accountSignedIn").hidden=!signedIn;
    if(signedIn){
      $("#accountName").textContent=currentCustomer.name;
      $("#accountContact").textContent=[currentCustomer.phone,currentCustomer.email].filter(Boolean).join(" · ");
      renderCustomerProfile();
      renderSavedAddress();
      loadMyBookings();
    }
    updateAccountButton();
  }
  function renderSavedAddress(){
    const saved=currentCustomer?.defaultAddress;
    $("#accountAddressSummary").textContent=saved?`${saved.area} · ${saved.address}${saved.landmark?` · Near ${saved.landmark}`:""}`:"No saved service address yet.";
    const form=$("#customerAddressForm");
    if(saved){form.elements.area.value=saved.area;form.elements.address.value=saved.address;form.elements.landmark.value=saved.landmark||"";selectedAddressPin=saved.latitude!=null&&saved.longitude!=null?{latitude:saved.latitude,longitude:saved.longitude}:null;}
    else {form.reset();selectedAddressPin=null;}
    $("#addressPinSummary").textContent=selectedAddressPin?`Pin selected: ${selectedAddressPin.latitude.toFixed(5)}, ${selectedAddressPin.longitude.toFixed(5)}`:"No map pin selected.";
  }
  function renderCustomerProfile(){
    const form=$("#customerProfileForm");
    form.elements.name.value=currentCustomer?.name||"";form.elements.phone.value=currentCustomer?.phone||"";form.elements.email.value=currentCustomer?.email||"";
  }
  function openAddressMap(){
    const backdrop=$("#addressMapModal");backdrop.classList.add("open");backdrop.setAttribute("aria-hidden","false");document.body.style.overflow="hidden";
    if(!window.L){$("#mapPickerStatus").textContent="Map library could not load. Check your internet connection.";return;}
    const initial=selectedAddressPin||{latitude:22.8456,longitude:89.5403};
    if(!addressMap){addressMap=L.map("addressMap").setView([initial.latitude,initial.longitude],selectedAddressPin?17:13);L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>'}).addTo(addressMap);addressMap.on("click",e=>setAddressPin(e.latlng.lat,e.latlng.lng));}
    else {addressMap.setView([initial.latitude,initial.longitude],selectedAddressPin?17:13);}
    setAddressPin(initial.latitude,initial.longitude);setTimeout(()=>addressMap.invalidateSize(),100);
  }
  function setAddressPin(latitude,longitude){
    selectedAddressPin={latitude,longitude};const point=[latitude,longitude];
    if(addressMap){if(!addressMarker)addressMarker=L.marker(point,{draggable:true}).addTo(addressMap).on("dragend",e=>{const p=e.target.getLatLng();setAddressPin(p.lat,p.lng);});else addressMarker.setLatLng(point);}
    $("#mapPickerStatus").textContent=`Selected: ${latitude.toFixed(5)}, ${longitude.toFixed(5)}. Drag the marker to adjust.`;
  }
  function closeAddressMap(){const el=$("#addressMapModal");el.classList.remove("open");el.setAttribute("aria-hidden","true");document.body.style.overflow=$("#accountModal").classList.contains("open")?"hidden":"";}
  function openAccount(mode="login"){
    showAccountView();
    if(!(customerToken&&currentCustomer)) setAccountForm(mode);
    const modal=$("#accountModal");modal.classList.add("open");modal.setAttribute("aria-hidden","false");document.body.style.overflow="hidden";
    (mode==="register"?$("#customerRegisterForm [name=name]"):mode==="reset"?$("#customerResetForm [name=email]"):$("#customerLoginForm [name=identifier]")).focus();
  }
  function closeAccount(){const modal=$("#accountModal");modal.classList.remove("open");modal.setAttribute("aria-hidden","true");document.body.style.overflow=""}
  function setAccountForm(mode){
    $("#customerLoginForm").hidden=mode!=="login";
    $("#customerRegisterForm").hidden=mode!=="register";
    $("#customerResetForm").hidden=mode!=="reset";
    $("#accountTitle").textContent=mode==="register"?"Create your Sucharu account":mode==="reset"?"Reset your password":"Sign in to your account";
    $("#loginMessage").textContent="";$("#registerMessage").textContent="";$("#resetMessage").textContent="";
    if(mode!=="reset"){
      if(resetResendTimer){clearInterval(resetResendTimer);resetResendTimer=null;}
      resetCodeRequested=false;
      $("#resetCodeFields").hidden=true;
      $("#resetResend").hidden=true;
      $("#resetResend").disabled=false;
      $("#resetResend").textContent="Send another code";
      $("#customerResetForm").reset();
      $("#customerResetForm [name=email]").readOnly=false;
      $("#resetSubmit").textContent="Send verification code";
    }
  }
  async function saveCustomerSession(data){
    if(data.firebaseCustomToken){
      const credential=await signInWithCustomToken(firebaseAuth,data.firebaseCustomToken);
      customerToken=await getIdToken(credential.user);
      localStorage.removeItem("sucharuCustomerToken");
    }else{
      customerToken=data.token;
      localStorage.setItem("sucharuCustomerToken",customerToken);
    }
    currentCustomer=data.customer;
    try{const response=await fetch(`${API}/customers/me`,{headers:{Authorization:`Bearer ${customerToken}`}});if(response.ok){const profile=await response.json();currentCustomer=profile.customer;}}catch{}
    localStorage.setItem("sucharuCustomerProfile",JSON.stringify(currentCustomer));
    showAccountView();closeAccount();
    if(pendingService!==null){const service=pendingService;pendingService=null;openBooking(service);}
  }
  async function clearCustomerSession(endFirebaseSession=false){
    customerToken=null;currentCustomer=null;
    localStorage.removeItem("sucharuCustomerToken");localStorage.removeItem("sucharuCustomerProfile");
    if(endFirebaseSession&&firebaseAuth.currentUser)await signOut(firebaseAuth).catch(()=>{});
    updateAccountButton();
  }
  async function customerBearerToken(){
    if(firebaseAuth.currentUser){
      customerToken=await getIdToken(firebaseAuth.currentUser);
      localStorage.removeItem("sucharuCustomerToken");
    }
    return customerToken;
  }
  async function restoreCustomerSession(){
    updateAccountButton();
    try{
      if(firebaseAuth.currentUser)customerToken=await getIdToken(firebaseAuth.currentUser);
      if(!customerToken)return;
      const response=await fetch(`${API}/customers/me`,{headers:{Authorization:`Bearer ${customerToken}`}});
      if(!response.ok)throw new Error("Session expired");
      const data=await response.json();currentCustomer=data.customer;
      localStorage.setItem("sucharuCustomerProfile",JSON.stringify(currentCustomer));updateAccountButton();
    }catch{await clearCustomerSession(Boolean(firebaseAuth.currentUser));}
  }
  async function loadMyBookings(){
    const container=$("#myBookings");container.textContent="Loading bookings…";
    try{
      const token=await customerBearerToken();
      const response=await fetch(`${API}/customers/bookings`,{headers:{Authorization:`Bearer ${token}`}});
      const rows=await response.json().catch(()=>[]);
      if(!response.ok)throw new Error(rows.message||"Could not load bookings.");
      if(!rows.length){container.textContent="No bookings yet.";return;}
      const statusLabels={booking_received:"Request received",confirmed:"Confirmed",assigned:"Partner assigned",on_the_way:"Partner on the way",service_started:"Service started",completed:"Completed",cancelled:"Cancelled"};
      container.innerHTML=rows.map(row=>`<article class="my-booking"><strong>${esc(row.service?.name||"Service")} · ${esc(row.bookingId)}</strong><span>${esc(statusLabels[row.status]||row.status)} · ${esc(row.schedule?.date||"")} · ${esc(row.schedule?.time||"")}</span><span>${esc(row.area||"")}</span></article>`).join("");
    }catch(error){container.textContent=error.message;}
  }
  function render() {
    const q = search.value.trim().toLowerCase();
    const rows = catalog.filter(s => (activeCategory === "All" || s.category === activeCategory) && `${s.name} ${s.category} ${s.description}`.toLowerCase().includes(q));
    grid.innerHTML = rows.map((s,i) => `<article class="service-card"><span class="service-icon" aria-hidden="true">${esc(s.icon)}</span><small>${esc(s.category)}</small><h3>${esc(s.name)}</h3><p>${esc(s.description)}</p><div class="service-meta"><span>${s.price == null ? "Pricing" : "Starting estimate"}</span><strong>${money(s.price)}</strong></div><button class="primary-btn" type="button" data-book="${i}">Request service</button></article>`).join("");
    $("#emptyState").hidden = rows.length > 0;
    const names = [...new Set(catalog.map(x=>x.name))];
    $("#priceTable").innerHTML = catalog.map(s=>`<tr><td>${esc(s.name)}</td><td>${money(s.price)}</td><td>${s.price == null ? "Quotation" : "Starting estimate"}</td><td><button class="filter-btn" type="button" data-book-name="${esc(s.name)}">Request</button></td></tr>`).join("");
    const select = $("#bookingService");
    const prior = select.value;
    select.innerHTML = `<option value="">Select a service</option>` + catalog.map(s=>`<option value="${esc(s.name)}" data-price="${s.price ?? ""}">${esc(s.name)}${s.price == null ? " — quote required" : ""}</option>`).join("");
    if(names.includes(prior)) select.value = prior;
  }
  async function loadCatalog(){
    const notice=$("#catalogNotice");
    try{
      const response=await fetch(`${API}/services`,{headers:{"Accept":"application/json"}});
      if(!response.ok) throw new Error("Catalog API unavailable");
      const rows=await response.json();
      if(!Array.isArray(rows)) throw new Error("Catalog response is invalid");
      catalog=rows.map(s=>({name:s.name,category:s.category,icon:s.icon||"🛠️",price:s.pricingModel==="quote"?null:s.startingPrice,description:s.description,pricingModel:s.pricingModel}));
      notice.hidden=true;
    }catch{
      catalog=[...exampleCatalog];
      notice.hidden=false;
      notice.textContent="Showing initial example estimates because the service catalog API is not connected. Booking requests cannot be submitted until the backend is running.";
    }
    activeCategory="All";
    const categoryList=["All",...new Set(catalog.map(x=>x.category))];
    filters.innerHTML=categoryList.map(c=>`<button type="button" class="filter-btn${c==="All"?" active":""}" data-category="${esc(c)}">${esc(c)}</button>`).join("");
    render();
  }
  function resetConfirmation(){
    $("#bookingForm").hidden=false;
    $("#bookingConfirmation").hidden=true;
  }
  function showBookingConfirmation(data,result){
    const paymentLabels={cash_on_service:"Cash on service (COD)",bkash_manual:"bKash",nagad_manual:"Nagad"};
    $("#confirmationBookingId").textContent=result.bookingId||"Request received";
    $("#confirmationService").textContent=data.service;
    $("#confirmationSchedule").textContent=`${data.date} · ${data.time}`;
    $("#confirmationArea").textContent=data.area==="other-kcc"?"Other Khulna City Corporation area":data.area;
    $("#confirmationPayment").textContent=paymentLabels[data.paymentMethod]||data.paymentMethod;
    $("#confirmationPaymentNote").textContent=data.paymentMethod==="cash_on_service"
      ?"No advance payment is needed. Sucharu will confirm availability and the final price by phone."
      :"Please wait for Sucharu to confirm your booking and payable amount before sending money. Never share your PIN or OTP. Payment is verified manually; online checkout is not active yet.";
    $("#bookingForm").hidden=true;
    $("#bookingConfirmation").hidden=false;
    $("#confirmationClose").focus();
  }
  function openBooking(service="") {
    if(!customerToken||!currentCustomer){pendingService=service;openAccount("login");toast("Sign in or create an account before booking.");return;}
    $("#bookingForm [name=name]").value=currentCustomer.name;
    $("#bookingForm [name=phone]").value=currentCustomer.phone;
    const saved=currentCustomer.defaultAddress;
    if(saved){$("#bookingForm [name=area]").value=saved.area;$("#bookingForm [name=address]").value=saved.address;$("#bookingForm [name=landmark]").value=saved.landmark||"";}
    const modal=$("#bookingModal"); modal.classList.add("open"); modal.setAttribute("aria-hidden","false"); document.body.style.overflow="hidden";
    resetConfirmation();
    if(service) $("#bookingService").value=service;
    priceUpdate(); $("#modalClose").focus();
  }
  function closeBooking(){const m=$("#bookingModal");m.classList.remove("open");m.setAttribute("aria-hidden","true");document.body.style.overflow=""}
  function priceUpdate(){const o=$("#bookingService").selectedOptions[0];$("#selectedPrice").textContent=o?.dataset.price ? `${money(o.dataset.price)} (estimate)` : (o?.value ? "Quotation required" : "—")}
  function paymentUpdate(){const method=$("#paymentMethod").value,help=$("#paymentHelp");if(method==="cash_on_service"){help.hidden=true;help.textContent="";return}const label=method==="bkash_manual"?"bKash":"Nagad";help.hidden=false;help.textContent=`${label} manual payment number: 01303-434078. Please wait until Sucharu confirms your booking and payable amount before sending money. Never share your PIN or OTP. Payment will be verified manually; online gateway checkout is not active yet.`}
  $("#trackingForm").addEventListener("submit",async e=>{
    e.preventDefault();
    const form=e.currentTarget,button=form.querySelector("button[type=submit]"),fields=Object.fromEntries(new FormData(form));
    const result=$("#trackingResult");
    result.hidden=false;result.classList.remove("error");result.textContent="Checking booking…";
    button.disabled=true;
    try{
      const query=new URLSearchParams({bookingId:fields.bookingId.trim(),phone:fields.phone.trim()});
      const response=await fetch(`${API}/bookings/track?${query.toString()}`,{headers:{"Accept":"application/json"}});
      const booking=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(booking.message||"Could not find that booking.");
      const labels={booking_received:"Request received",confirmed:"Confirmed",assigned:"Partner assigned",on_the_way:"Partner on the way",service_started:"Service started",completed:"Completed",cancelled:"Cancelled"};
      result.innerHTML=`<div class="tracking-result-head"><strong>${esc(labels[booking.status]||booking.status)}</strong><span>${esc(booking.bookingId)}</span></div><p><b>${esc(booking.service)}</b></p><p>${esc(booking.schedule?.date||"")} · ${esc(booking.schedule?.time||"")} · ${esc(booking.area==="other-kcc"?"Other KCC area":booking.area)}</p>${booking.partnerName?`<p>Assigned partner: <b>${esc(booking.partnerName)}</b></p>`:""}`;
    }catch(error){result.classList.add("error");result.textContent=error instanceof TypeError?"Could not connect. Check the internet connection and try again.":error.message}
    finally{button.disabled=false;button.textContent="Check status"}
  });
  $("#accountButton").addEventListener("click",()=>openAccount("login"));
  $("#accountClose").addEventListener("click",closeAccount);
  $("#accountModal").addEventListener("click",e=>{if(e.target.id==="accountModal")closeAccount()});
  $("#showRegister").addEventListener("click",()=>setAccountForm("register"));
  $("#showLogin").addEventListener("click",()=>setAccountForm("login"));
  document.addEventListener("keydown",e=>{if(e.key==="Escape"){closeBooking();closeAccount()}});
  $("#customerLoginForm").addEventListener("submit",async e=>{
    e.preventDefault();const form=e.currentTarget,button=form.querySelector("button[type=submit]"),data=Object.fromEntries(new FormData(form));
    $("#loginMessage").textContent="";button.disabled=true;button.textContent="Signing in…";
    try{
      const response=await fetch(`${API}/auth/customer/login`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(data)});
      const result=await response.json().catch(()=>({}));if(!response.ok)throw new Error(result.message||"Could not sign in.");
      form.reset();await saveCustomerSession(result);
    }catch(error){$("#loginMessage").textContent=error instanceof TypeError?"Could not connect. Check that the backend is running.":error.message;}
    finally{button.disabled=false;button.textContent="Sign in";}
  });
  async function requestPasswordResetCode(email){
    const response=await fetch(`${API}/auth/customer/password/reset/request`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email})});
    const payload=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(payload.message||"Could not send the reset code.");
    resetCodeRequested=true;
    $("#customerResetForm [name=email]").readOnly=true;
    $("#resetCodeFields").hidden=false;
    $("#resetSubmit").textContent="Verify code and reset password";
    $("#resetMessage").textContent=payload.message||"If an account uses that email, a 6-digit code has been sent.";
    const resend=$("#resetResend");resend.hidden=false;resend.disabled=true;
    let seconds=60;resend.textContent=`Resend in ${seconds}s`;
    if(resetResendTimer)clearInterval(resetResendTimer);
    resetResendTimer=setInterval(()=>{
      seconds--;
      if(seconds<=0){clearInterval(resetResendTimer);resetResendTimer=null;resend.disabled=false;resend.textContent="Send another code";}
      else resend.textContent=`Resend in ${seconds}s`;
    },1000);
  }
  $("#showPasswordReset").addEventListener("click",()=>openAccount("reset"));
  $("#resetBackToLogin").addEventListener("click",()=>setAccountForm("login"));
  $("#resetResend").addEventListener("click",async()=>{
    const resend=$("#resetResend"),message=$("#resetMessage"),email=$("#customerResetForm [name=email]").value.trim().toLowerCase();
    if(!email)return;
    resend.disabled=true;message.textContent="Requesting a new verification code…";
    try{await requestPasswordResetCode(email);}
    catch(error){message.textContent=error.message||"Could not resend the code.";resend.disabled=false;resend.textContent="Try sending again";}
  });
  $("#customerResetForm").addEventListener("submit",async e=>{
    e.preventDefault();
    const form=e.currentTarget,button=$("#resetSubmit"),data=Object.fromEntries(new FormData(form));
    const message=$("#resetMessage");message.textContent="";button.disabled=true;
    try{
      const email=String(data.email||"").trim().toLowerCase();
      if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new Error("Enter a valid registered email address.");
      if(!resetCodeRequested){
        await requestPasswordResetCode(email);
        return;
      }
      if(String(data.password||"").length<6)throw new Error("New password must be at least 6 characters.");
      if(data.password!==data.confirmPassword)throw new Error("The passwords do not match.");
      const code=String(data.code||"").trim();
      if(!/^\d{6}$/.test(code))throw new Error("Enter the 6-digit email code.");
      const response=await fetch(`${API}/auth/customer/password/reset/complete`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email,code,password:data.password})});
      const payload=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(payload.message||"Could not reset the password.");
      form.reset();resetCodeRequested=false;$("#resetCodeFields").hidden=true;$("#customerResetForm [name=email]").readOnly=false;
      if(resetResendTimer){clearInterval(resetResendTimer);resetResendTimer=null;}
      setAccountForm("login");$("#customerLoginForm [name=identifier]").value=email;
      $("#loginMessage").textContent=payload.message||"Password updated. Sign in with your new password.";
    }catch(error){
      message.textContent=error instanceof TypeError?"Could not connect. Check that the backend is running.":error.message||"Could not reset the password.";
    }finally{button.disabled=false;button.textContent=resetCodeRequested?"Verify code and reset password":"Send verification code";}
  });
  $("#customerRegisterForm").addEventListener("submit",async e=>{
    e.preventDefault();const form=e.currentTarget,button=form.querySelector("button[type=submit]"),data=Object.fromEntries(new FormData(form));
    $("#registerMessage").textContent="";button.disabled=true;button.textContent="Creating account…";
    try{
      if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(data.email||"").trim()))throw new Error("Enter a valid email address. It is required for password recovery.");
      const response=await fetch(`${API}/auth/customer/register`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(data)});
      const result=await response.json().catch(()=>({}));if(!response.ok)throw new Error(result.message||"Could not create the account.");
      form.reset();await saveCustomerSession(result);
    }catch(error){$("#registerMessage").textContent=error instanceof TypeError?"Could not connect. Check that the backend is running.":error.message;}
    finally{button.disabled=false;button.textContent="Create account";}
  });
  $("#customerLogout").addEventListener("click",async()=>{await clearCustomerSession(true);showAccountView();setAccountForm("login")});
  $("#toggleProfileEditor").addEventListener("click",()=>{const form=$("#customerProfileForm");if(form.hidden){renderCustomerProfile();$("#profileMessage").textContent="";form.hidden=false;}else form.hidden=true;});
  $("#customerProfileForm").addEventListener("submit",async e=>{
    e.preventDefault();const form=e.currentTarget,button=form.querySelector('[type="submit"]'),message=$("#profileMessage"),data=Object.fromEntries(new FormData(form));
    message.textContent="";button.disabled=true;button.textContent="Saving…";
    try{
      if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(data.email||"").trim()))throw new Error("Enter a valid email address.");
      if(data.newPassword&&data.newPassword.length<6)throw new Error("New password must be at least 6 characters.");
      if(data.newPassword!==data.confirmPassword)throw new Error("The new passwords do not match.");
      const identityChanged=String(data.phone||"").trim()!==String(currentCustomer.phone||"").trim()||String(data.email||"").trim().toLowerCase()!==String(currentCustomer.email||"").trim().toLowerCase();
      if((identityChanged||data.newPassword)&&!data.currentPassword)throw new Error("Enter your current password to change phone, email or password.");
      const body={name:data.name,phone:data.phone,email:data.email};
      if(identityChanged||data.newPassword)body.currentPassword=data.currentPassword;
      if(data.newPassword)body.newPassword=data.newPassword;
      const token=await customerBearerToken(),response=await fetch(`${API}/customers/me`,{method:"PATCH",headers:{"Content-Type":"application/json",Authorization:`Bearer ${token}`},body:JSON.stringify(body)}),payload=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(payload.message||"Could not save account details.");
      currentCustomer=payload.customer;localStorage.setItem("sucharuCustomerProfile",JSON.stringify(currentCustomer));
      form.elements.currentPassword.value="";form.elements.newPassword.value="";form.elements.confirmPassword.value="";
      showAccountView();form.hidden=false;message.textContent="Account details saved.";
    }catch(error){message.textContent=error instanceof TypeError?"Could not connect to the server.":error.message;}
    finally{button.disabled=false;button.textContent="Save account details";}
  });
  $("#toggleAddressEditor").addEventListener("click",()=>{const form=$("#customerAddressForm");if(form.hidden){renderSavedAddress();form.hidden=false;}else form.hidden=true;});
  $("#pickAddressMap").addEventListener("click",openAddressMap);
  $("#addressMapClose").addEventListener("click",closeAddressMap);
  $("#addressMapModal").addEventListener("click",e=>{if(e.target.id==="addressMapModal")closeAddressMap();});
  $("#confirmAddressPin").addEventListener("click",()=>{if(!selectedAddressPin){$("#mapPickerStatus").textContent="Tap the map to choose a pin first.";return;}$("#addressPinSummary").textContent=`Pin selected: ${selectedAddressPin.latitude.toFixed(5)}, ${selectedAddressPin.longitude.toFixed(5)}`;closeAddressMap();});
  $("#customerAddressForm").addEventListener("submit",async e=>{
    e.preventDefault();const form=e.currentTarget,button=form.querySelector('[type="submit"]'),message=$("#addressMessage"),data=Object.fromEntries(new FormData(form));
    message.textContent="";button.disabled=true;button.textContent="Saving…";
    try{
      const token=await customerBearerToken(),defaultAddress={label:"Home",area:data.area,address:data.address,landmark:data.landmark,...(selectedAddressPin||{})};
      const response=await fetch(`${API}/customers/me`,{method:"PATCH",headers:{"Content-Type":"application/json",Authorization:`Bearer ${token}`},body:JSON.stringify({defaultAddress})}),payload=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(payload.message||"Could not save the address.");
      currentCustomer=payload.customer;localStorage.setItem("sucharuCustomerProfile",JSON.stringify(currentCustomer));renderSavedAddress();message.textContent="Address saved to your account.";showAccountView();form.hidden=false;
    }catch(error){message.textContent=error instanceof TypeError?"Could not connect to the server.":error.message;}
    finally{button.disabled=false;button.textContent="Save address";}
  });
  $("#removeSavedAddress").addEventListener("click",async()=>{const button=$("#removeSavedAddress"),message=$("#addressMessage");button.disabled=true;try{const token=await customerBearerToken(),response=await fetch(`${API}/customers/me`,{method:"PATCH",headers:{"Content-Type":"application/json",Authorization:`Bearer ${token}`},body:JSON.stringify({defaultAddress:null})}),payload=await response.json().catch(()=>({}));if(!response.ok)throw new Error(payload.message||"Could not remove the address.");currentCustomer=payload.customer;localStorage.setItem("sucharuCustomerProfile",JSON.stringify(currentCustomer));renderSavedAddress();message.textContent="Saved address removed.";}catch(error){message.textContent=error.message||"Could not remove the address.";}finally{button.disabled=false;}});
  filters.addEventListener("click",e=>{const b=e.target.closest("[data-category]");if(!b)return;activeCategory=b.dataset.category;filters.querySelectorAll("button").forEach(x=>x.classList.toggle("active",x===b));render()});
  search.addEventListener("input",render); $("#heroSearch").addEventListener("input",()=>{search.value=$("#heroSearch").value;render()});
  $("#heroSearchBtn").addEventListener("click",()=>{$("#services").scrollIntoView();search.focus()});
  grid.addEventListener("click",e=>{const b=e.target.closest("[data-book]");if(b)openBooking([...catalog.filter(s=>(activeCategory==="All"||s.category===activeCategory)&&`${s.name} ${s.category} ${s.description}`.toLowerCase().includes(search.value.trim().toLowerCase()))][Number(b.dataset.book)]?.name)});
  $("#priceTable").addEventListener("click",e=>{const b=e.target.closest("[data-book-name]");if(b)openBooking(b.dataset.bookName)});
  document.querySelectorAll("[data-open-booking]").forEach(b=>b.addEventListener("click",()=>openBooking(b.dataset.service||"")));
  $("#modalClose").addEventListener("click",closeBooking);$("#confirmationClose").addEventListener("click",closeBooking);$("#bookingModal").addEventListener("click",e=>{if(e.target.id==="bookingModal")closeBooking()});document.addEventListener("keydown",e=>{if(e.key==="Escape")closeBooking()});
  $("#bookingService").addEventListener("change",priceUpdate);
  $("#paymentMethod").addEventListener("change",paymentUpdate);
  const date=$("input[name=date]");date.min=new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,10);
  $("#menuToggle").addEventListener("click",()=>{const nav=$(".navbar");nav.classList.toggle("menu-open");$("#menuToggle").setAttribute("aria-expanded",String(nav.classList.contains("menu-open")))});
  $("#mainNav").addEventListener("click",e=>{if(e.target.closest("a"))$(".navbar").classList.remove("menu-open")});
  $("#year").textContent=new Date().getFullYear();
  $("#bookingForm").addEventListener("submit",async e=>{
    e.preventDefault();const form=e.currentTarget,button=form.querySelector("button[type=submit]"),data=Object.fromEntries(new FormData(form));
    const phone=data.phone.replace(/[\s-]/g,"");if(!/^(?:\+?8801|01)[3-9]\d{8}$/.test(phone)){toast("Enter a valid Bangladesh mobile number.");return}
    button.disabled=true;button.textContent="Sending…";
    if(!customerToken||!currentCustomer){closeBooking();pendingService=data.service;openAccount("login");button.disabled=false;button.textContent="Submit Booking Request →";return;}
    try{const token=await customerBearerToken(),saved=currentCustomer.defaultAddress,sameAddress=saved&&saved.address===data.address&&saved.area===data.area,body={service:{name:data.service},schedule:{date:data.date,time:data.time},area:data.area,address:data.address,landmark:data.landmark,note:data.note,paymentMethod:data.paymentMethod,...(sameAddress&&saved.latitude!=null?{location:{latitude:saved.latitude,longitude:saved.longitude}}:{})};const response=await fetch(`${API}/bookings`,{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${token}`},body:JSON.stringify(body)});const result=await response.json().catch(()=>({}));if(!response.ok)throw new Error(result.message||"Could not submit booking.");showBookingConfirmation(data,result);form.reset();priceUpdate();paymentUpdate();loadMyBookings()}catch(err){toast(err instanceof TypeError?"Could not connect to the booking API. Check that the backend is running.":err.message||"Could not submit booking.")}finally{button.disabled=false;button.textContent="Submit Booking Request →"}
  });
  let toastTimer;function toast(message){const el=$("#toast");el.textContent=message;el.classList.add("show");clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove("show"),4500)}
  loadCatalog();paymentUpdate();onAuthStateChanged(firebaseAuth,()=>{restoreCustomerSession();});
})();
