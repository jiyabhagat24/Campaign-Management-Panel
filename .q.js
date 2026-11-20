const {PrismaClient}=require(process.cwd()+"/node_modules/@prisma/client");
const p=new PrismaClient();
(async()=>{const u=await p.user.findMany({where:{role:{in:["BUSINESS_DEVELOPMENT","BRAND_SOLUTIONS"]}},select:{name:true,email:true,role:true,active:true}}).catch(async e=>{console.log(e.message.slice(0,200));return p.user.findMany({where:{role:{in:["BUSINESS_DEVELOPMENT","BRAND_SOLUTIONS"]}},select:{name:true,email:true,role:true}})});console.log(u);console.log(await p.brief.count());await p.$disconnect()})();
