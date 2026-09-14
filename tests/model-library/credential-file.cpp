#include "../../src/slic3r/GUI/LibraryCredentialFile.hpp"
#include <iostream>
int main(int argc, char** argv)
{
    using Slic3r::GUI::LibraryCredentialFile;
    if (argc != 3)
        return 2;
    LibraryCredentialFile store(argv[2]);
    std::string           action(argv[1]), value;
    const std::string     synthetic = "synthetic-test-only-not-a-key";
    bool                  ok        = false;
    try {
        if (action == "isolation") {
            LibraryCredentialFile other(argv[2], "makerworld.token");
            other.save(std::string(2048, 'x'));
            std::string second;
            ok = other.load(second) && second.size() == 2048 && store.load(value) && value == synthetic;
        }
        if (action == "write") {
            store.save(synthetic);
            ok = true;
        }
        if (action == "read")
            ok = store.load(value) && value == synthetic;
        if (action == "missing")
            ok = !store.load(value);
        if (action == "disconnect") {
            store.save("");
            ok = true;
        }
        if (action == "disconnected")
            ok = store.load(value) && value.empty();
        if (action == "reject-invalid") {
            try {
                store.save("invalid key");
            } catch (...) {
                ok = store.load(value) && value == synthetic;
            }
        }
        if (action == "reject-file") {
            try {
                store.load(value);
            } catch (...) {
                ok = true;
            }
        }
    } catch (...) {
        ok = false;
    }
    std::cout << (ok ? "PASS " : "FAIL ") << action << '\n';
    return ok ? 0 : 1;
}
