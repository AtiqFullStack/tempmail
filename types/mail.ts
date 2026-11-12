export type Attachment = {
  _id: string;
  filename: string;
  contentType: string;
  size: number;
};
export type Mail = {
  _id: string;
  from: string;
  to?: string;
  cc?: string;
  subject: string;
  preview: string;
  receivedAt: string;
  expiresAt: string;
  attachments: Attachment[];
  text?: string;
  sanitizedHtml?: string;
  envelopeRecipient?: string;
};
export type InboxResponse = {
  messages: Mail[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
};
