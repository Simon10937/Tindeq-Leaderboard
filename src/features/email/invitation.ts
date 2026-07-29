const escapeHtml = (value: string) =>
  value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]!);

export function groupInvitationEmail(groupName: string, inviteUrl: string) {
  const safeGroup = escapeHtml(groupName);
  const safeUrl = escapeHtml(inviteUrl);
  return {
    subject: `Join ${groupName} on Cruxboard`,
    text: `You have been invited to join ${groupName} on Cruxboard. Open this private invitation: ${inviteUrl}\n\nThe invitation expires in seven days and can only be used by this email address.`,
    html: `<p>You have been invited to join <strong>${safeGroup}</strong> on Cruxboard.</p><p><a href="${safeUrl}" rel="noreferrer">Open private invitation</a></p><p>This invitation expires in seven days and can only be used by this email address.</p>`,
  };
}
