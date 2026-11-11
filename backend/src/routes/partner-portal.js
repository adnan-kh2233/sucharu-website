const express=require("express");const crypto=require("node:crypto");const {all,collection,get,put,remove}=require("../config/store");const {requirePartner}=require("../middleware/auth");const {createPartnerCustomToken}=require("../config/firebase");const {notifyCustomer,tokenId}=require("../services/customer-notifications");const {clearLivePartnerLocation,publishLivePartnerLocation}=require("../services/live-partner-location");
const router=express.Router();router.use(requirePartner);
router.post("/firebase-session",async(req,res,next)=>{try{return res.json({firebaseCustomToken:await createPartnerCustomToken(req.partner)});}catch(error){next(error);}});
router.get("/jobs",async(req,res,next)=>{try{return res.json((await all("bookings")).filter(b=>b.partner?.partnerId===req.partner._id&&b.status!=="cancelled").sort((a,b)=>String(a.schedule?.date).localeCompare(String(b.schedule?.date))||String(b.createdAt).localeCompare(String(a.createdAt))).slice(0,100).map(({startOtpHash,startOtpSalt,startOtpIssuedAt,startOtpExpiresAt,startOtpAttempts,...job})=>job));}catch(e){next(e);}});
router.post("/device-tokens",async(req,res,next)=>{try{
 const token=String(req.body?.token||"").trim(),action=String(req.body?.action||"register");if(token.length<32||token.length>4096)return res.status(400).json({message:"A valid notification token is required."});
 const ref=collection("partnerDeviceTokens").doc(tokenId(token));if(action==="delete"){const existing=await ref.get();if(existing.exists&&existing.data().partnerId===req.partner._id)await ref.delete();return res.json({message:"Notification device removed."});}
 await ref.set({token,partnerId:req.partner._id,platform:String(req.body?.platform||"android"),updatedAt:new Date()},{merge:true});return res.json({message:"Partner notifications enabled."});
}catch(e){next(e);}});
router.post("/jobs/:bookingId/location",async(req,res,next)=>{try{
 const booking=await get("bookings",req.params.bookingId);
 if(!booking||booking.partner?.partnerId!==req.partner._id)return res.status(404).json({message:"Assigned booking not found."});
 if(booking.status!=="on_the_way")return res.status(409).json({message:"Location sharing is available only while you are on the way."});
 const latitude=Number(req.body?.latitude),longitude=Number(req.body?.longitude),accuracy=Number(req.body?.accuracy);
 if(!Number.isFinite(latitude)||latitude < -90||latitude > 90||!Number.isFinite(longitude)||longitude < -180||longitude > 180||!Number.isFinite(accuracy)||accuracy < 0||accuracy > 10000)return res.status(400).json({message:"Send a valid GPS location and accuracy."});
 const previous=await get("bookingLocations",booking._id),now=Date.now();
 if(previous&&now-new Date(previous.updatedAt||0).getTime()<5000)return res.status(429).json({message:"Location updates are arriving too quickly."});
 const location={bookingId:booking.bookingId,customerId:booking.customerId,partnerId:req.partner._id,latitude,longitude,accuracy,updatedAt:new Date(now)};
 await put("bookingLocations",booking._id,location);
 await publishLivePartnerLocation(booking,location);
 return res.json({bookingId:booking.bookingId,updatedAt:new Date(now).toISOString()});
}catch(e){next(e);}});
router.post("/jobs/:bookingId/location/stop",async(req,res,next)=>{try{
 const booking=await get("bookings",req.params.bookingId);
 if(!booking||booking.partner?.partnerId!==req.partner._id)return res.status(404).json({message:"Assigned booking not found."});
 await remove("bookingLocations",booking._id);await clearLivePartnerLocation(booking.bookingId);
 return res.json({bookingId:booking.bookingId,message:"Location sharing stopped."});
}catch(e){next(e);}});
router.post("/jobs/:bookingId/start-service",async(req,res,next)=>{try{
 const booking=await get("bookings",req.params.bookingId),code=String(req.body?.code||"").trim();
 if(!booking||booking.partner?.partnerId!==req.partner._id)return res.status(404).json({message:"Assigned booking not found."});
 if(booking.status!=="on_the_way")return res.status(409).json({message:"The job must be on the way before service can start."});
 if(!/^\d{6}$/.test(code))return res.status(400).json({message:"Enter the 6-digit code shown in the customer app."});
 const expiresAt=new Date(booking.startOtpExpiresAt||0).getTime(),attempts=Number(booking.startOtpAttempts||0);
 if(!booking.startOtpHash||!booking.startOtpSalt||expiresAt<Date.now())return res.status(410).json({message:"The customer code expired. Ask them to generate a new code."});
 if(attempts>=5)return res.status(429).json({message:"Too many incorrect codes. Ask the customer to generate a new code."});
 const expected=Buffer.from(booking.startOtpHash,"hex"),actual=crypto.scryptSync(code,booking.startOtpSalt,expected.length);
 if(expected.length!==actual.length||!crypto.timingSafeEqual(expected,actual)){
  await put("bookings",booking._id,{startOtpAttempts:attempts+1},true);
  return res.status(401).json({message:`That code is incorrect. ${4-attempts} attempt${4-attempts===1?"":"s"} remain.`});
 }
 await put("bookings",booking._id,{status:"service_started",serviceStartedAt:new Date(),startOtpHash:null,startOtpSalt:null,startOtpExpiresAt:null,startOtpAttempts:0},true);
 await remove("bookingLocations",booking._id);await clearLivePartnerLocation(booking.bookingId);
 const title="Service started",body=`${booking.service?.name||"Your service"} has started after you shared the check-in code.`;
 await notifyCustomer({customerId:booking.customerId,bookingId:booking.bookingId,type:"booking_status",title,body});
 return res.json({bookingId:booking.bookingId,status:"service_started",message:"Customer code verified. Service started."});
}catch(e){next(e);}});
router.post("/jobs/:bookingId/complete",async(req,res,next)=>{try{
 const booking=await get("bookings",req.params.bookingId);
 if(!booking||booking.partner?.partnerId!==req.partner._id)return res.status(404).json({message:"Assigned booking not found."});
 if(booking.status!=="service_started")return res.status(409).json({message:"Start the service with the customer code before completing it."});
 const checklist=req.body?.checklist||{},notes=String(req.body?.notes||"").trim();
 if(checklist.workCompleted!==true||checklist.areaChecked!==true||checklist.followUpExplained!==true)return res.status(400).json({message:"Confirm each service checklist item before submitting the report."});
 if(notes.length>1000)return res.status(400).json({message:"Keep the completion note under 1000 characters."});
 const photo=(value,kind)=>{if(value==null||value==="")return null;if(typeof value!=="string"||value.length>205000)return false;if(/^https:\/\/firebasestorage\.googleapis\.com\//.test(value)){try{const parsed=new URL(value),prefix=`partners/${req.partner._id}/bookings/${booking._id}/completion/${kind}-`;return parsed.hostname==="firebasestorage.googleapis.com"&&parsed.pathname.startsWith(`/v0/b/sucharu-87667.firebasestorage.app/o/${encodeURIComponent(prefix)}`);}catch{return false;}}if(!/^[A-Za-z0-9+/]*={0,2}$/.test(value))return false;const bytes=Buffer.from(value,"base64");return bytes.length<=150*1024&&bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff?value:false;};
 const beforeImage=photo(req.body?.beforeImage,"before"),afterImage=photo(req.body?.afterImage,"after");
 if(beforeImage===false||afterImage===false)return res.status(400).json({message:"Each optional photo must be a valid compressed image no larger than 150 KB."});
 const proof={bookingId:booking.bookingId,customerId:booking.customerId,partnerId:req.partner._id,checklist:{workCompleted:true,areaChecked:true,followUpExplained:true},notes,beforeImage,afterImage,reportedAt:new Date()};
 await put("bookingCompletionProofs",booking._id,proof);
 const updated=await put("bookings",booking._id,{status:"awaiting_customer_confirmation",serviceCompletionReportAt:new Date(),completionProofPresent:true},true);
 await remove("bookingLocations",booking._id);await clearLivePartnerLocation(booking.bookingId);
 await notifyCustomer({customerId:booking.customerId,bookingId:booking.bookingId,type:"booking_confirmation_required",title:"Please confirm your service",body:`${booking.service?.name||"Your service"} report is ready. Review it and confirm the service or report a problem.`});
 return res.json({bookingId:updated.bookingId,status:updated.status,message:"Service report submitted. Waiting for customer confirmation."});
}catch(e){next(e);}});
router.patch("/jobs/:bookingId/status",async(req,res,next)=>{try{
 const transitions={assigned:"on_the_way"},booking=await get("bookings",req.params.bookingId);
 if(!booking||booking.partner?.partnerId!==req.partner._id||booking.status==="cancelled")return res.status(404).json({message:"Assigned booking not found."});
 const nextStatus=transitions[booking.status];if(!nextStatus||req.body?.status!==nextStatus)return res.status(409).json({message:booking.status==="on_the_way"&&req.body?.status==="service_started"?"Verify the customer's start code before starting service.":booking.status==="service_started"&&req.body?.status==="completed"?"Submit a service completion report; the customer must confirm it.":"This booking cannot move to that status. Follow the listed service steps."});
 await put("bookings",booking._id,{status:nextStatus},true);if(nextStatus!=="on_the_way"){await remove("bookingLocations",booking._id);await clearLivePartnerLocation(booking.bookingId);}if(nextStatus==="completed")await put("partners",req.partner._id,{completedJobs:Number(req.partner.completedJobs||0)+1},true);const labels={on_the_way:"Your partner is on the way",service_started:"Your service has started",completed:"Your service is complete"};await notifyCustomer({customerId:booking.customerId,bookingId:booking.bookingId,type:"booking_status",title:labels[nextStatus],body:`${booking.service?.name||"Your service"} · ${labels[nextStatus]}.`});
 return res.json({bookingId:booking.bookingId,status:nextStatus});
}catch(e){next(e);}});module.exports=router;
