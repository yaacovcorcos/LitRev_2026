import Link from "next/link";
import styles from "./BaseBackButton.module.css";

type BaseBackButtonProps = {
    href: string;
    label?: string;
    className?: string;
};

export function BaseBackButton({ href, label = "Back", className = "" }: BaseBackButtonProps) {
    return (
        <Link href={href} className={`${styles.backButton} ${className}`.trim()} aria-label={label}>
            <span className="material-icons-round">arrow_back</span>
        </Link>
    );
}
