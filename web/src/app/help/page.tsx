import type { Metadata } from 'next';
import { LegalPage } from '@/components/legal';
export const metadata: Metadata = { title: 'How Sadhai works' };

export default function Help() {
  return (
    <LegalPage title="How Sadhai works">
      <p>A short guide for staff, managers and owners. Prices are the same everywhere: hot coffee Rs 100, flavored drinks Rs 120, iced drinks Rs 150.</p>
      <h2>If you work at a counter</h2>
      <ol><li>Sign in with your mobile number, then open <strong>My shift</strong>.</li><li>Press <strong>Start my shift</strong> when you arrive (up to 30 minutes early).</li><li>Tick the checklist for your duty as you go.</li><li>Press <strong>End my shift</strong> when you finish. Your paid hours are counted for you.</li><li>Need a day off? Use <strong>Ask for time off</strong> on the same screen.</li><li>Not sure how to make a drink? Open <strong>Recipes</strong>. Every station makes it the same way.</li></ol>
      <h2>If you manage a station</h2>
      <ol><li>Open <strong>Staff and roster</strong>, press <strong>Auto-assign</strong>, check the board, then <strong>Publish</strong>.</li><li>Check <strong>Attendance</strong> for anything flagged and fix hours with a reason.</li><li>Approve or decline <strong>Time off</strong>.</li></ol>
      <h2>If you own Sadhai</h2>
      <ol><li>Add your keys under <strong>Settings and keys</strong> and press Test next to each.</li><li>Change pictures and text under <strong>Home page and pictures</strong>.</li><li>Run <strong>Payroll</strong> for a date range, approve it, then mark it paid.</li></ol>
      <p>More detail is in the project’s <code>docs/WORKFLOWS.md</code>.</p>
    </LegalPage>
  );
}
