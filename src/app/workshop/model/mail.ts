interface Attachment {
  readonly name: string;
  readonly contentType: string;
  /** Bytes. */
  readonly size: number;
}

export interface Mail {
  readonly id: string;
  /** Greenmail mailboxes the mail was delivered to, which also shows Bcc recipients. */
  readonly mailboxes: readonly string[];
  readonly subject: string;
  readonly from: string;
  readonly to: readonly string[];
  readonly cc: readonly string[];
  /** Epoch millis from the Date header. */
  readonly date: number | null;
  /** A text-only mail comes as HTML too. */
  readonly html: string;
  readonly attachments: readonly Attachment[];
}
