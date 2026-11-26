const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  const camps = await p.campaign.findMany({ where: { OR: [{ name: { contains: 'cookwell', mode: 'insensitive' } }, { brandName: { contains: 'cookwell', mode: 'insensitive' } }] }, select: { id: true, name: true, brandName: true } }).catch(async e => { console.log('fallback', e.message.slice(0,200)); return p.campaign.findMany({ where: { name: { contains: 'cookwell', mode: 'insensitive' } }, select: { id: true, name: true } }); });
  console.log('campaigns', JSON.stringify(camps));
  const cr = await p.creator.findMany({ where: { name: { contains: 'ansh', mode: 'insensitive' } }, select: { id: true, name: true, status: true, campaignId: true, platform: true, finalQuotedCost: true, pocUserId: true } }).catch(e => { console.log(e.message.slice(0,300)); return []; });
  console.log('creators', JSON.stringify(cr, null, 1));
  await p.$disconnect();
})();
