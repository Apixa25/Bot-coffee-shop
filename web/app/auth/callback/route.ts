import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const error = requestUrl.searchParams.get('error');
  const errorDescription = requestUrl.searchParams.get('error_description');

  if (error) {
    console.error('OAuth error:', error, errorDescription);
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(errorDescription || error)}`, requestUrl.origin)
    );
  }

  if (code) {
    const supabase = await createClient();
    
    try {
      const { data: { user }, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
      
      if (exchangeError) {
        console.error('Error exchanging code for session:', exchangeError);
        return NextResponse.redirect(
          new URL(`/login?error=${encodeURIComponent(exchangeError.message)}`, requestUrl.origin)
        );
      }

      if (user) {
        const { data: existingOwner } = await supabase
          .from('owners')
          .select('id')
          .eq('auth_id', user.id)
          .single();

        if (!existingOwner) {
          const { error: ownerError } = await supabase
            .from('owners')
            .insert({
              auth_id: user.id,
              email: user.email,
            });

          if (ownerError) {
            console.error('Error creating owner record:', ownerError);
          }
        }

        return NextResponse.redirect(new URL('/dashboard', requestUrl.origin));
      }
    } catch (err) {
      console.error('Unexpected error during OAuth callback:', err);
      return NextResponse.redirect(
        new URL('/login?error=An unexpected error occurred', requestUrl.origin)
      );
    }
  }

  return NextResponse.redirect(new URL('/login?error=No code provided', requestUrl.origin));
}
