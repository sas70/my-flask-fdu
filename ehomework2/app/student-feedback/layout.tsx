import "./student-feedback.css";

export default function StudentFeedbackLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="student-feedback-page">
      {children}
    </div>
  );
}
