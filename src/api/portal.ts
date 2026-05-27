import client from './client';

export interface PortalSessionResponse {
  portalUrl: string;
}

export async function createPortalSession(): Promise<PortalSessionResponse> {
  const { data } = await client.post<PortalSessionResponse>('/portal/create-session', {
    returnOrigin: window.location.origin,
    returnPath: '/upload',
  });
  return data;
}
