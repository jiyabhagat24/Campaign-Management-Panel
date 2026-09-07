import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isClient } from "@/lib/rbac";
import Link from "next/link";

export default async function FilesPage() {
  const user = await currentUser();
  if (!user) redirect("/login");

  const files = isClient(user.role)
    ? await prisma.fileAsset.findMany({ where: { campaign: { clientAccess: { some: { clientId: user.id } } } }, include: { campaign: true }, orderBy: { createdAt: "desc" } })
    : await prisma.fileAsset.findMany({ include: { campaign: true }, orderBy: { createdAt: "desc" } });

  return (
    <div className="p-8">
      <h1 className="text-lg font-semibold text-ink">Files</h1>
      <p className="mt-1 max-w-2xl text-sm text-slate-500">
        Briefs, script docs, approved snapshots, and creative assets. In this scaffold, files are referenced by URL
        (script/content approval already store a snapshot URL per deliverable). Wire real upload storage — S3 / GCS —
        per README "File storage" when you're ready.
      </p>
      <div className="mt-6 divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
        {files.map((f) => (
          <div key={f.id} className="flex items-center justify-between px-5 py-3 text-sm">
            <div>
              <a href={f.url} target="_blank" className="font-medium text-brand hover:underline">{f.name}</a>
              <p className="text-xs text-slate-400">
                <Link href={`/campaigns/${f.campaignId}`} className="hover:underline">{f.campaign.name}</Link> · {new Date(f.createdAt).toLocaleDateString()}
              </p>
            </div>
          </div>
        ))}
        {files.length === 0 && <p className="px-5 py-8 text-center text-sm text-slate-400">No files yet.</p>}
      </div>
    </div>
  );
}
