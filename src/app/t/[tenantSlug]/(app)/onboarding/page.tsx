import dynamic from 'next/dynamic';
import { SkeletonCard, SkeletonHeading } from '@/components/ui/skeleton';

export const forceDynamic = 'force-dynamic';

const OnboardingWizard = dynamic(
    () => import('@/components/onboarding/OnboardingWizard'),
    {
        loading: () => (
            <div className="space-y-6 animate-fadeIn" aria-busy="true">
                <SkeletonHeading className="w-full sm:w-48" />
                <SkeletonCard lines={6} />
            </div>
        ),
        ssr: false,
    }
);

export default function OnboardingPage() {
    return <OnboardingWizard />;
}
