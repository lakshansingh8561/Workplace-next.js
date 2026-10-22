import { Category, PlatformMetric, ValueProposition, HowItWorksStep } from "@/types";

/**
 * Initial static categories and marketplace stats for UI verification.
 * Pre-populated with popular skills for client-side search filtering.
 */
export const POPULAR_CATEGORIES: Category[] = [
  {
    id: "dev-it",
    name: "Development & IT",
    slug: "development-it",
    icon: "code",
    jobCount: 1850,
    description: "Software engineers, web developers, mobile app architects & DevOps.",
    skills: ["React", "Next.js", "TypeScript", "Python", "Node.js", "AWS"],
  },
  {
    id: "ai-services",
    name: "AI Services & ML",
    slug: "ai-services",
    icon: "cpu",
    jobCount: 940,
    description: "Prompt engineers, LLM fine-tuners, data scientists & vision models.",
    skills: ["Prompt Engineering", "PyTorch", "LLMs", "LangChain", "OpenAI"],
  },
  {
    id: "design",
    name: "Design & Creative",
    slug: "design-creative",
    icon: "palette",
    jobCount: 1120,
    description: "UI/UX designers, brand strategists, animators & product illustrators.",
    skills: ["Figma", "UI/UX", "Design Systems", "Webflow", "Branding"],
  },
  {
    id: "sales-mkt",
    name: "Sales & Marketing",
    slug: "sales-marketing",
    icon: "trending-up",
    jobCount: 830,
    description: "SEO specialists, performance marketers, growth hackers & media buyers.",
    skills: ["SEO", "Google Ads", "Growth Marketing", "Social Media", "Email Marketing"],
  },
  {
    id: "writing",
    name: "Writing & Translation",
    slug: "writing-translation",
    icon: "file-text",
    jobCount: 520,
    description: "Technical copywriters, localization specialists & content editors.",
    skills: ["Technical Writing", "Copywriting", "Localization", "Ghostwriting"],
  },
  {
    id: "admin-support",
    name: "Admin & Customer Support",
    slug: "admin-customer-support",
    icon: "headset",
    jobCount: 680,
    description: "Executive virtual assistants, Zendesk specialists & data entry experts.",
    skills: ["Virtual Assistance", "Customer Support", "Zendesk", "Data Entry"],
  },
  {
    id: "finance-accounting",
    name: "Finance & Accounting",                             
    slug: "finance-accounting",
    icon: "calculator",   
    jobCount: 460, 
    description: "Certified public accountants, CFO consultants & bookkeeping pros.",   
    skills: ["QuickBooks", "Financial Modeling", "Tax Planning", "Bookkeeping"],
  },   
  {
    id: "engineering-arch",   
    name: "Engineering & Architecture",
    slug: "engineering-architecture",
    icon: "layers",
    jobCount: 390,
    description: "CAD draftsmen, structural engineers & 3D architectural visualizers.",
    skills: ["AutoCAD", "SolidWorks", "3D Rendering", "BIM", "Structural Design"],
  },
];

export const PLATFORM_METRICS: PlatformMetric[] = [
  { label: "Active Freelancers", value: "50,000+", description: "Vetted independent pros across 140+ countries" },
  { label: "Completed Projects", value: "120,000+", description: "Successfully delivered contracts worldwide" },
  { label: "Client Satisfaction", value: "98.5%", description: "Positive client feedback on completed milestones" },
  { label: "Average Time to Hire", value: "< 48 hrs", description: "From posting a requirement to signing contract" },
];

export const VALUE_PROPOSITIONS: ValueProposition[] = [
  {
    id: "vetted-talent",
    title: "Proof of Quality",
    description: "Check portfolios, verified client reviews, and identity badges before committing.",
    icon: "shield-check",
  },
  {
    id: "no-cost-until-hire",
    title: "No Cost Until You Hire",
    description: "Interview candidates, negotiate rates, and only release payments for approved milestones.",
    icon: "wallet",
  },
  {
    id: "safe-secure",
    title: "Safe & Secure Collaboration",
    description: "Integrated escrow payments, encrypted contracts, and 24/7 dedicated dispute support.",
    icon: "lock",
  },
  {
    id: "scalable-talent",
    title: "Scale On-Demand",
    description: "Hire individual domain specialists for quick tasks or build full distributed project teams.",
    icon: "users",
  },  
];

export const HOW_IT_WORKS_STEPS: HowItWorksStep[] = [
  {
    step: "01",
    title: "Post a Job or Browse Talent",
    description: "Publish your project requirements or directly browse top-rated freelancer profiles.",
    forRole: "client",
  },
  {
    step: "02",
    title: "Review Proposals & Match",
    description: "Receive tailored proposals, inspect past works, and chat directly in real-time.",
    forRole: "client",
  },
  {
    step: "03",
    title: "Collaborate & Release Payment",
    description: "Track progress with milestones. Only approve funds when work meets your expectations.",
    forRole: "client",
  },
];
