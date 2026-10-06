import React from 'react';
import * as Icons from 'lucide-react';

interface IconRendererProps {
  name: string;
  className?: string;
  size?: number;
}

export const IconRenderer: React.FC<IconRendererProps> = ({ name, className = 'w-4 h-4', size }) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const IconComponent = (Icons as any)[name] || Icons.HelpCircle;
  return <IconComponent className={className} size={size} />;
};

export const LocalCloudLogo: React.FC<{ className?: string; size?: number }> = ({ className = 'w-6 h-6', size = 24 }) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="LocalCloud Logo"
    >
      {/* LocalCloud mark: a four-lobe cloud in the project's own palette. */}
      {/* Left indigo lobe */}
      <path
        d="M6.5 18C4.01472 18 2 15.9853 2 13.5C2 11.2057 3.71715 9.31422 5.94164 9.04351C6.20815 6.22384 8.59891 4 11.5 4C13.2373 4 14.7877 4.79584 15.8115 6.04688"
        stroke="#818CF8"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      {/* Top violet arch */}
      <path
        d="M12 4C14.7614 4 17 6.23858 17 9C17 9.35121 16.9638 9.69395 16.8951 10.0245"
        stroke="#A78BFA"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      {/* Right cyan lobe */}
      <path
        d="M17 9.5C19.7614 9.5 22 11.7386 22 14.5C22 17.2614 19.7614 19.5 17 19.5H14"
        stroke="#22D3EE"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      {/* Bottom amber base */}
      <path
        d="M6 18H15"
        stroke="#FBBF24"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
};
