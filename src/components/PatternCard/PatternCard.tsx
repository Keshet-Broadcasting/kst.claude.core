import styles from './PatternCard.module.css';

type Props = {
  title: string;
  description: string;
  file: string;
};

export function PatternCard({ title, description, file }: Props) {
  return (
    <article className={styles.card}>
      <h2 className={styles.title}>{title}</h2>
      <p className={styles.description}>{description}</p>
      <code className={styles.file}>{file}</code>
    </article>
  );
}
