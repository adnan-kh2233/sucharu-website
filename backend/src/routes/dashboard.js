const express=require("express");const {all}=require("../config/store");const {requireAdmin}=require("../middleware/auth");
const router=express.Router();router.get("/summary",requireAdmin,async(req,res,next)=>{try{
 const [bookings,partners,services]=await Promise.all([all("bookings"),all("partners"),all("services")]),counts={};for(const b of bookings)counts[b.status]=(counts[b.status]||0)+1;
 const completedServiceValue=bookings.filter(b=>b.status==="completed"&&b.service?.estimatedPrice!=null).reduce((sum,b)=>sum+Number(b.service.estimatedPrice||0),0);
 return res.json({bookings:bookings.length,activePartners:partners.filter(p=>p.status==="active"&&p.verificationStatus==="verified").length,activeServices:services.filter(s=>s.active).length,completedServiceValue,statusCounts:Object.entries(counts).sort(([a],[b])=>a.localeCompare(b)).map(([_id,count])=>({_id,count}))});
}catch(e){next(e);}});module.exports=router;
