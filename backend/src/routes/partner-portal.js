const express=require("express");const {all,collection,get,put}=require("../config/store");const {requirePartner}=require("../middleware/auth");const {notifyCustomer,tokenId}=require("../services/customer-notifications");
const router=express.Router();router.use(requirePartner);
router.get("/jobs",async(req,res,next)=>{try{return res.json((await all("bookings")).filter(b=>b.partner?.partnerId===req.partner._id&&b.status!=="cancelled").sort((a,b)=>String(a.schedule?.date).localeCompare(String(b.schedule?.date))||String(b.createdAt).localeCompare(String(a.createdAt))).slice(0,100));}catch(e){next(e);}});
router.post("/device-tokens",async(req,res,next)=>{try{
 const token=String(req.body?.token||"").trim(),action=String(req.body?.action||"register");if(token.length<32||token.length>4096)return res.status(400).json({message:"A valid notification token is required."});
 const ref=collection("partnerDeviceTokens").doc(tokenId(token));if(action==="delete"){const existing=await ref.get();if(existing.exists&&existing.data().partnerId===req.partner._id)await ref.delete();return res.json({message:"Notification device removed."});}
 await ref.set({token,partnerId:req.partner._id,platform:String(req.body?.platform||"android"),updatedAt:new Date()},{merge:true});return res.json({message:"Partner notifications enabled."});
}catch(e){next(e);}});
router.patch("/jobs/:bookingId/status",async(req,res,next)=>{try{
 const transitions={assigned:"on_the_way",on_the_way:"service_started",service_started:"completed"},booking=await get("bookings",req.params.bookingId);
 if(!booking||booking.partner?.partnerId!==req.partner._id||booking.status==="cancelled")return res.status(404).json({message:"Assigned booking not found."});
 const nextStatus=transitions[booking.status];if(!nextStatus||req.body?.status!==nextStatus)return res.status(409).json({message:"This booking cannot move to that status. Follow the listed service steps."});
 await put("bookings",booking._id,{status:nextStatus},true);if(nextStatus==="completed")await put("partners",req.partner._id,{completedJobs:Number(req.partner.completedJobs||0)+1},true);const labels={on_the_way:"Your partner is on the way",service_started:"Your service has started",completed:"Your service is complete"};await notifyCustomer({customerId:booking.customerId,bookingId:booking.bookingId,type:"booking_status",title:labels[nextStatus],body:`${booking.service?.name||"Your service"} · ${labels[nextStatus]}.`});
 return res.json({bookingId:booking.bookingId,status:nextStatus});
}catch(e){next(e);}});module.exports=router;
