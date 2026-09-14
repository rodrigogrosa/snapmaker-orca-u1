#pragma once
// Private per-user storage for local macOS builds whose ad-hoc signature changes.
// No credential is embedded in the app, passed to JavaScript, or logged.
#include <filesystem>
#include <string>
#include <stdexcept>
#include <atomic>
#include <cerrno>
#include <fcntl.h>
#include <sys/stat.h>
#include <unistd.h>

namespace Slic3r { namespace GUI {
class LibraryCredentialFile
{
    struct FD
    {
        int value;
        explicit FD(int fd) : value(fd)
        {
            if (fd < 0)
                throw std::runtime_error("credential storage");
        }
        ~FD() { close(value); }
        FD(const FD&) = delete;
    };
    std::filesystem::path directory;
    std::string           filename;
    static void           check(int fd, bool folder)
    {
        struct stat s{};
        if (fstat(fd, &s) || s.st_uid != getuid() || (folder ? !S_ISDIR(s.st_mode) : !S_ISREG(s.st_mode)) || (!folder && s.st_nlink != 1) ||
            fchmod(fd, folder ? 0700 : 0600))
            throw std::runtime_error("credential permissions");
    }

public:
    explicit LibraryCredentialFile(std::filesystem::path path, std::string name = "thingiverse.token")
        : directory(std::move(path)), filename(std::move(name))
    {
        if (filename != "thingiverse.token" && filename != "makerworld.token")
            throw std::runtime_error("credential name");
    }
    static bool valid(const std::string& value)
    { return value.size() <= 8192 && value.find_first_of("\r\n\t \0", 0, 5) == std::string::npos; }
    // Missing and explicitly disconnected are different: an empty file is a tombstone.
    bool load(std::string& value) const
    {
        int raw = open(directory.c_str(), O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC);
        if (raw < 0 && errno == ENOENT)
            return false;
        FD dir(raw);
        check(dir.value, true);
        raw = openat(dir.value, filename.c_str(), O_RDONLY | O_NOFOLLOW | O_CLOEXEC | O_NONBLOCK);
        if (raw < 0 && errno == ENOENT)
            return false;
        FD file(raw);
        check(file.value, false);
        std::string result;
        char        buffer[513];
        for (;;) {
            const auto count = read(file.value, buffer, sizeof(buffer));
            if (count < 0 && errno == EINTR)
                continue;
            if (count < 0)
                throw std::runtime_error("credential read");
            if (!count)
                break;
            result.append(buffer, size_t(count));
            if (result.size() > 8192)
                throw std::runtime_error("credential size");
        }
        if (!valid(result))
            throw std::runtime_error("credential format");
        value = std::move(result);
        return true;
    }
    void save(const std::string& value) const
    {
        if (!valid(value))
            throw std::runtime_error("credential format");
        if (mkdir(directory.c_str(), 0700) && errno != EEXIST)
            throw std::runtime_error("credential directory");
        FD dir(open(directory.c_str(), O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC));
        check(dir.value, true);
        static std::atomic<unsigned> serial{0};
        const auto                   temporary = ".pending-" + std::to_string(getpid()) + "-" + std::to_string(++serial);
        FD                           file(openat(dir.value, temporary.c_str(), O_WRONLY | O_CREAT | O_EXCL | O_NOFOLLOW | O_CLOEXEC, 0600));
        try {
            size_t done = 0;
            while (done < value.size()) {
                const auto count = write(file.value, value.data() + done, value.size() - done);
                if (count < 0 && errno == EINTR)
                    continue;
                if (count <= 0)
                    throw std::runtime_error("credential write");
                done += size_t(count);
            }
            if (fsync(file.value) || renameat(dir.value, temporary.c_str(), dir.value, filename.c_str()))
                throw std::runtime_error("credential commit");
            fsync(dir.value);
        } catch (...) {
            unlinkat(dir.value, temporary.c_str(), 0);
            throw;
        }
    }
};
}} // namespace Slic3r::GUI
