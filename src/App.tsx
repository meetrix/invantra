import { BrowserRouter, Navigate, Outlet, Route, Routes } from "react-router-dom";
import { Nav } from "./components/Nav";
import { AuthProvider, useAuth } from "./lib/auth";
import { Home } from "./pages/Home";
import { AccountPage, ForcedPasswordChange } from "./pages/auth/ChangePasswordPage";
import { LoginPage } from "./pages/auth/LoginPage";
import { SetPasswordPage } from "./pages/auth/SetPasswordPage";
import { CustomerForm } from "./pages/customers/CustomerForm";
import { CustomersList } from "./pages/customers/CustomersList";
import { DocumentEditor } from "./pages/documents/DocumentEditor";
import { DocumentList } from "./pages/documents/DocumentList";
import { DocumentPrint } from "./pages/documents/DocumentPrint";
import { DocumentView } from "./pages/documents/DocumentView";
import { PaymentsList } from "./pages/payments/PaymentsList";
import { ItemForm } from "./pages/items/ItemForm";
import { ItemsList } from "./pages/items/ItemsList";
import { SettingsPage } from "./pages/settings/SettingsPage";
import { UsersPage } from "./pages/users/UsersPage";

function Layout() {
  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 dark:bg-gray-950 dark:text-gray-100">
      <Nav />
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <Outlet />
      </main>
    </div>
  );
}

/** Everything behind the sign-in. The server enforces access; this only decides what to show. */
function SignedIn() {
  const { user, can } = useAuth();
  if (user === undefined) return <p className="p-8 text-gray-500">Loading…</p>;
  // The address is left as it is, so signing in lands on the page that was asked for.
  if (user === null) return <LoginPage />;
  if (user.mustChangePassword) return <ForcedPasswordChange />;

  return (
    <Routes>
      <Route path="/documents/:id/print" element={<DocumentPrint />} />
      <Route element={<Layout />}>
        <Route path="/" element={<Home />} />
        <Route path="/customers" element={<CustomersList />} />
        <Route path="/customers/new" element={<CustomerForm />} />
        <Route path="/customers/:id" element={<CustomerForm />} />
        <Route path="/items" element={<ItemsList />} />
        <Route path="/items/new" element={<ItemForm />} />
        <Route path="/items/:id" element={<ItemForm />} />
        <Route path="/estimates" element={<DocumentList kind="estimate" />} />
        <Route path="/estimates/new" element={<DocumentEditor kind="estimate" />} />
        <Route path="/estimates/:id" element={<DocumentView kind="estimate" />} />
        <Route path="/invoices" element={<DocumentList kind="invoice" />} />
        <Route path="/invoices/new" element={<DocumentEditor kind="invoice" />} />
        <Route path="/invoices/:id" element={<DocumentView kind="invoice" />} />
        <Route path="/payments" element={<PaymentsList />} />
        <Route path="/account" element={<AccountPage />} />
        {can("users.manage") && <Route path="/users" element={<UsersPage />} />}
        {can("settings.write") && <Route path="/settings" element={<SettingsPage />} />}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/set-password" element={<SetPasswordPage />} />
          <Route path="*" element={<SignedIn />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
