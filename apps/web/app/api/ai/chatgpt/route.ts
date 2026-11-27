import { NextResponse } from 'next/server';
import { rejectUntrustedLocalRequest } from '@/app/lib/localRequestGuard';
import {
  cancelChatGPTSignIn,
  chatGPTStatus,
  signOutOfChatGPT,
  startChatGPTSignIn,
} from '../chatgpt';

export const dynamic = 'force-dynamic';

/** Sign-in state. Never returns tokens. */
export async function GET(req: Request) {
  const rejected = rejectUntrustedLocalRequest(req);
  if (rejected) return rejected;
  return NextResponse.json(chatGPTStatus());
}

/** Start "Continue with ChatGPT". Returns the authorize URL to open. */
export async function POST(req: Request) {
  const rejected = rejectUntrustedLocalRequest(req);
  if (rejected) return rejected;
  try {
    return NextResponse.json(await startChatGPTSignIn());
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

/** Sign out (revoke + forget), or `?cancel=1` to abandon a pending sign-in. */
export async function DELETE(req: Request) {
  const rejected = rejectUntrustedLocalRequest(req);
  if (rejected) return rejected;
  if (new URL(req.url).searchParams.get('cancel')) {
    cancelChatGPTSignIn();
    return NextResponse.json(chatGPTStatus());
  }
  return NextResponse.json(await signOutOfChatGPT());
}
