import express from "express";
import {paymentMiddleware} from "@x402/express";
import {x402ResourceServer,HTTPFacilitatorClient} from "@x402/core/server";
import {ExactEvmScheme} from "@x402/evm/exact/server";
import {EXAMPLE_QUOTE,parsePublicQuote,evaluatePublicQuote,CHAIN,NATIVE_BASE_USDC,VERSION} from "./analyze.mjs";

const PAY_TO=process.env.PAY_TO||"0xfCbE632f37F760218216b37df52f0d73f9020234";
const PORT=Number(process.env.PORT||8737);
const HOST=process.env.HOST||"0.0.0.0";
const FACILITATOR_URL=process.env.FACILITATOR_URL||"https://facilitator.openx402.ai";
if(!/^0x[0-9a-fA-F]{40}$/.test(PAY_TO)||!Number.isInteger(PORT)||PORT<1024||PORT>65535)throw Error("INVALID_PUBLIC_PAYOUT_OR_PORT");
if(!["127.0.0.1","0.0.0.0"].includes(HOST))throw Error("INVALID_BIND_HOST");
if(!FACILITATOR_URL.startsWith("https://"))throw Error("UNSAFE_FACILITATOR");
const facilitator=new HTTPFacilitatorClient({url:FACILITATOR_URL});
const resourceServer=new x402ResourceServer(facilitator);
resourceServer.register("eip155:*",new ExactEvmScheme());
await resourceServer.initialize(); // fail closed if facilitator unavailable
const route="GET /v1/x402-preflight";
const price="$0.01";
const payment=paymentMiddleware({
 [route]:{
  accepts:{scheme:"exact",price,network:CHAIN,payTo:PAY_TO},
  mimeType:"application/json",
  description:"Deterministic offline x402 v2 public 402 quote structure review. One original VM3 human-owner AI-assisted seller. Does not test live merchant/pay/replay."
 }
},resourceServer,undefined,undefined,false);
const app=express();
app.disable("x-powered-by");
app.set("trust proxy",HOST==="0.0.0.0"?1:"loopback");
let accepted=0;const sessions=new Map();
app.use((req,res,next)=>{
 const id=req.ip;const t=Date.now();const state=sessions.get(id);
 const s=!state||t-state.t>60000?{t,c:0}:state;s.c++;sessions.set(id,s);
 if(sessions.size>700)for(const [ip,x] of sessions)if(t-x.t>60000)sessions.delete(ip);
 if(s.c>70)return res.status(429).json({ok:false,charged:false,error:"Rate-limited; no payment requested."});
 res.setHeader("Cache-Control","no-store");
 next();
});
app.get("/",(_req,res)=>res.redirect(302,"/v1/docs"));
app.get("/health",(_req,res)=>res.json({ok:true,version:VERSION,kind:"original_vm3_quote_preflight",configuredNoSecretWallet:true,paytoPublicVerified:true}));
app.get("/v1/sample",(_req,res)=>res.json({ok:true,paid:false,example:EXAMPLE_QUOTE,analysis:evaluatePublicQuote(EXAMPLE_QUOTE),warning:"Synthetic public quote example only. No merchant is live, no user has paid."}));
app.get("/v1/docs",(_req,res)=>res.json({
 name:"VM3 x402 Public Quote Offline QA",version:VERSION,method:"GET",paidPath:"/v1/x402-preflight",priceUSDC:"0.01",chain:CHAIN,asset:NATIVE_BASE_USDC,publicRecipient:PAY_TO,
 input:"optional query quote=<JSON or base64 sanitized public PAYMENT-REQUIRED header; omitted means synthetic public fixture>",
 freePreview:"GET /v1/sample",limits:{maxQueryChars:12000,rateLimitPerIPPerMinute:70},
 disclosure:"One original human beneficiary. AI-assisted offline input-only protocol consistency review. NO real endpoint contacted, no seller verification, no investment or production-security certification. No money is received by visiting documentation."
}));
function prepayment(req,res,next){
 try {
  const keys=Object.keys(req.query);
  if(keys.some(k=>k!=="quote")||keys.length>1) return res.status(400).json({ok:false,charged:false,error:"Only a public quote query is permitted."});
  if(req.originalUrl.length>17500)return res.status(413).json({ok:false,charged:false,error:"Quote exceeds size limit before payment."});
  const parsed=parsePublicQuote(req.query.quote);
  res.locals.analysis=evaluatePublicQuote(parsed);
  next();
 }catch(e){res.status(400).json({ok:false,charged:false,error:e.code||e.message||"INVALID_PUBLIC_QUOTE"});}
}
// Public x402 v2 quote compatibility: expose identical canonical payment-required
// bytes to old discovery clients without changing facilitator/signing/settlement.
function publicChallengeMirror(_req,res,next){
 const oldSend=res.send;
 res.send=function(body){
  const raw=res.getHeader("PAYMENT-REQUIRED");
  if(res.statusCode===402 && typeof raw==="string" && raw.length<15000){
   try{
    const quote=JSON.parse(Buffer.from(raw,"base64").toString("utf8"));
    const a=quote?.accepts;
    if(quote.x402Version===2&&Array.isArray(a)&&a.length===1&&
      a[0]?.scheme==="exact"&&a[0]?.network===CHAIN&&
      a[0]?.asset?.toLowerCase()===NATIVE_BASE_USDC&&
      a[0]?.payTo?.toLowerCase()===PAY_TO.toLowerCase()&&
      a[0]?.amount==="10000"){
      res.setHeader("X-Payment-Required",raw);
      res.setHeader("Access-Control-Expose-Headers","PAYMENT-REQUIRED,X-Payment-Required,PAYMENT-RESPONSE");
      res.type("json");
      return oldSend.call(res,JSON.stringify(quote));
    }
   }catch{}
  }
  return oldSend.call(res,body);
 };
 next();
}
app.get("/v1/x402-preflight",prepayment,publicChallengeMirror,payment,(_req,res)=>{
 accepted++;
 res.status(200).json({...res.locals.analysis,receiptClaimNotProvenByUs:true});
});
app.use((_req,res)=>res.status(404).json({ok:false,charged:false,error:"Not found"}));
app.listen(PORT,HOST,()=>console.log("VM3 original x402 offline public challenge API ready port="+PORT+" host="+HOST+" receiver configured; no paid sale claimed."));
