import type { ReactNode } from "react";

interface CardProps {
  title?: string;
  children: ReactNode;
  className?: string;
}

export default function Card({ title, children, className = "" }: CardProps) {
  return (
    <div className={`rounded-lg bg-white p-6 shadow ${className}`}>
      {title && <h3 className="mb-4 text-lg font-medium text-gray-900">{title}</h3>}
      {children}
    </div>
  );
}
