export {};

declare global {
  /**
   * Shape of the custom claims we add to the Clerk session token.
   * Configured once in the Clerk Dashboard under Sessions → Customize
   * session token: { "metadata": "{{user.public_metadata}}" }
   */
  interface CustomJwtSessionClaims {
    metadata?: {
      role?: "admin";
    };
  }
}
