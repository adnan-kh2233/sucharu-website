const express=require("express");const {all,get,put}=require("../config/store");const {requirePartner}=require("../middleware/auth");
const router=express.Router();router.use(requirePartner);
router.get("/jobs",async(req,res,next)=>{try{return res.json((await all("bookings")).filter(b=>b.partner?.partnerId===req.partner._id&&b.status!=="cancelled").sort((a,b)=>String(a.schedule?.date).localeCompare(String(b.schedule?.date))||String(b.createdAt).localeCompare(String(a.createdAt))).slice(0,100));}catch(e){next(e);}});
router.patch("/jobs/:bookingId/status",async(req,res,next)=>{try{
 const transitions={assigned:"on_the_way",on_the_way:"service_started",service_started:"completed"},booking=await get("bookings",req.params.bookingId);
 if(!booking||booking.partner?.partnerId!==req.partner._id||booking.status==="cancelled")return res.status(404).json({message:"Assigned booking not found."});
 const nextStatus=transitions[booking.status];if(!nextStatus||req.body?.status!==nextStatus)return res.status(409).json({message:"This booking cannot move to that status. Follow the listed service steps."});
 await put("bookings",booking._id,{status:nextStatus},true);if(nextStatus==="completed")await put("partners",req.partner._id,{completedJobs:Number(req.partner.completedJobs||0)+1},true);
 return res.json({bookingId:booking.bookingId,status:nextStatus});
}catch(e){next(e);}});module.exports=router;
