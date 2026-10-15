# 04 — Origin-screening policy and legal launch gate

**Status: product policy only; not legal advice or launch clearance.** The user explicitly left launch countries, founder and operator locations, entity structure, and counsel review **open**. Earlier exclusions or foundation plans are not decisions.

## What the V1 mechanism intends to enforce

One ASP evaluates the public source of each SOL or USDC deposit under a documented policy. A confirmed deposit's note remains pending and cannot be privately spent until its origin is approved. Each later private spend proves that its hidden origin is in the current approved set; transfer outputs preserve that origin. Revocation must stop descendants from future **private** spending. Stale approval roots must not bypass a revocation. Public exit is intended for the current note holder, including after transfer, with an ownership proof that reveals the originating deposit rather than reusable spending or nullifier secrets.

This is a **provenance rule**, not identity verification. A screened depositor may privately pay someone the ASP never screened; a public withdrawal recipient may also be different. Accordingly, the product must not promise that every holder or exit recipient is unsanctioned. Whether this policy is lawful or sufficient anywhere is a question for qualified local counsel.

The cited [0xbow Privacy Pools design](https://docs.privacypools.com/protocol/ragequit) permits the **original depositor** to ragequit. It does not establish that a transferable descendant can exit safely. Our public-exit behavior needs its own protocol proof and legal assessment.

## Questions counsel must resolve before launch

1. Where are users, founders, keyholders, entity, frontend, ASP, and relayer actually located and controlled? Which services are provided into which countries?
2. Does operating screening, relaying, upgrades, fees, or a frontend trigger licensing, AML/CFT, sanctions, consumer-protection, or data duties in each proposed market? Would recipient controls or identification be required?
3. Is origin-only approval acceptable? Can an operator permit a public exit after revocation or sanctions discovery, and what disclosures, holds, or reporting might law require?
4. What can geofencing or access controls realistically enforce when a public program remains callable directly? What terms and incident processes are required?
5. How do USDC issuer blocklisting and a frozen vault affect customer rights and claims about availability?

Non-custody, an offshore entity, no fee on principal, or the label “privacy pool” do **not** determine legal classification. [FATF](https://www.fatf-gafi.org/en/publications/Fatfrecommendations/Guidance-rba-virtual-assets-2021.html) focuses on actual control and activities; [FinCEN](https://www.fincen.gov/system/files/2019-05/FinCEN%20Guidance%20CVC%20FINAL%20508.pdf) distinguishes software provision from operating an anonymizing service. [VARA's published rules](https://rulebooks.vara.ae/rulebook/c-prohibited-virtual-assets) illustrate why location-specific analysis matters. [Circle's USDC terms](https://www.circle.com/legal/usdc-terms) reserve blocklisting and freezing rights.

**Launch gate:** obtain written, country-specific advice for the real operating model and reconcile it with the protocol before production deposits. Do not infer approval from Treasury's [Tornado Cash delisting](https://home.treasury.gov/news/press-releases/sb0057) or from another protocol's deployment.
