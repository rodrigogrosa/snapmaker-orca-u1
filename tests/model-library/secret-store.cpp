// Run write, read and delete in separate processes. Uses only a synthetic secret.
#include <wx/init.h>
#include <wx/secretstore.h>
#include <iostream>
#include <string>
int main(int argc, char** argv)
{
    wxInitializer init;
    if (!init.IsOk() || argc != 2)
        return 1;
    auto                store   = wxSecretStore::GetDefault();
    const wxString      service = "com.rodrigogrosa.u1lab.tests.persistence";
    const wxSecretValue expected(wxString("synthetic-test-value-not-a-credential"));
    if (!store.IsOk())
        return 2;
    std::string action(argv[1]);
    bool        ok = false;
    if (action == "write")
        ok = store.Save(service, "test", expected);
    if (action == "read") {
        wxString      user;
        wxSecretValue actual;
        ok = store.Load(service, user, actual) && user == "test" && actual == expected;
    }
    if (action == "delete")
        ok = store.Delete(service);
    if (action == "absent") {
        wxString      user;
        wxSecretValue actual;
        ok = !store.Load(service, user, actual);
    }
    std::cout << (ok ? "PASS " : "FAIL ") << action << '\n';
    return ok ? 0 : 3;
}
