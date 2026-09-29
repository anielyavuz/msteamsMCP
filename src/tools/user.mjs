// Identity tools: who is signed in, and is the connection healthy.

export const authStatus = {
  name: "auth_status",
  title: "Connection status",
  description: "Show which Microsoft account this server acts as, the granted permissions and token expiry.",
  access: "read",
  scopes: [],
  inputSchema: {},
  async handler(_args, { auth }) {
    return auth.status();
  },
};

export const getCurrentUser = {
  name: "get_current_user",
  title: "My profile",
  description: "Profile of the signed-in user (name, UPN, mail, job title, department, office).",
  access: "read",
  scopes: ["User.Read"],
  inputSchema: {},
  async handler(_args, { graph }) {
    return graph.get("/me?$select=id,displayName,userPrincipalName,mail,jobTitle,department,officeLocation");
  },
};
