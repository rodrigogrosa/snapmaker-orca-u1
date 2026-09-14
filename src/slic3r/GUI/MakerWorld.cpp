// MakerWorld interoperability using community-documented endpoints.
// References: Doridian/OpenBambuAPI and maziggy/bambuddy; not an official Bambu integration.
#include "WebViewDialog.hpp"
#include "GUI_App.hpp"
#include "MainFrame.hpp"
#include "Plater.hpp"
#include "MakerWorldUrls.hpp"
#ifdef __APPLE__
#include "LibraryCredentialFile.hpp"
#endif
#include <nlohmann/json.hpp>
#include <curl/curl.h>
#include <wx/textdlg.h>
#include <wx/weakref.h>
#include <boost/filesystem.hpp>
#include <fstream>
#include <thread>
#include <regex>
#include <set>

namespace Slic3r { namespace GUI {
using MJ = nlohmann::json;
namespace {
struct Response
{
    std::string body, csrf;
    long        status = 0;
    size_t      limit  = 8 * 1024 * 1024;
};
size_t receive(char* ptr, size_t size, size_t count, void* context)
{
    auto&  r = *static_cast<Response*>(context);
    size_t n = size * count;
    if (n > r.limit - r.body.size())
        return 0;
    r.body.append(ptr, n);
    return n;
}
size_t headers(char* ptr, size_t size, size_t count, void* context)
{
    size_t      n = size * count;
    std::string line(ptr, n);
    auto        p = line.find("bbl_csrf_token=");
    if (p != std::string::npos) {
        p += 15;
        auto end                              = line.find_first_of(";\r\n", p);
        static_cast<Response*>(context)->csrf = line.substr(p, end - p);
    }
    return n;
}
Response fetch(
    const std::string& url, const std::string& token = "", const std::string& body = "", const std::string& csrf = "", bool file = false)
{
    auto* c = curl_easy_init();
    if (!c)
        throw std::runtime_error("Falha ao iniciar conexão.");
    curl_slist* h   = nullptr;
    auto        add = [&](const std::string& v) { h = curl_slist_append(h, v.c_str()); };
    add("User-Agent: U1Lab/0.1 (+https://github.com/rodrigogrosa/snapmaker-orca-u1)");
    add("Accept: application/json, */*");
    if (!token.empty())
        add("Authorization: Bearer " + token);
    if (!body.empty())
        add("Content-Type: application/json");
    if (!csrf.empty()) {
        add("Cookie: bbl_csrf_token=" + csrf);
        add("x-bbl-csrf-token: " + csrf);
    }
    Response r;
    if (file)
        r.limit = 200 * 1024 * 1024;
    curl_easy_setopt(c, CURLOPT_URL, url.c_str());
    curl_easy_setopt(c, CURLOPT_HTTPHEADER, h);
    curl_easy_setopt(c, CURLOPT_FOLLOWLOCATION, 0L);
    curl_easy_setopt(c, CURLOPT_VERBOSE, 0L);
    curl_easy_setopt(c, CURLOPT_CONNECTTIMEOUT, 15L);
    curl_easy_setopt(c, CURLOPT_TIMEOUT, file ? 150L : 30L);
    curl_easy_setopt(c, CURLOPT_NOSIGNAL, 1L);
    curl_easy_setopt(c, CURLOPT_WRITEFUNCTION, receive);
    curl_easy_setopt(c, CURLOPT_WRITEDATA, &r);
    curl_easy_setopt(c, CURLOPT_HEADERFUNCTION, headers);
    curl_easy_setopt(c, CURLOPT_HEADERDATA, &r);
    if (!body.empty()) {
        curl_easy_setopt(c, CURLOPT_POSTFIELDS, body.data());
        curl_easy_setopt(c, CURLOPT_POSTFIELDSIZE, long(body.size()));
    }
    auto result = curl_easy_perform(c);
    curl_easy_getinfo(c, CURLINFO_RESPONSE_CODE, &r.status);
    curl_slist_free_all(h);
    curl_easy_cleanup(c);
    if (result != CURLE_OK)
        throw std::runtime_error("Não foi possível concluir a conexão com o MakerWorld. Tente novamente.");
    if (r.status == 401)
        throw std::runtime_error("A sessão MakerWorld expirou ou foi recusada. Conecte sua conta novamente.");
    if (r.status == 403 || r.status == 418)
        throw std::runtime_error("O MakerWorld recusou o acesso ou exige uma verificação. A operação foi interrompida.");
    if (r.status != 200)
        throw std::runtime_error("O MakerWorld não concluiu a solicitação (HTTP " + std::to_string(r.status) + ").");
    return r;
}
MJ json(const Response& r)
{
    auto j = MJ::parse(r.body, nullptr, false);
    if (j.is_discarded() || !j.is_object())
        throw std::runtime_error("Resposta inesperada do MakerWorld.");
    return j;
}
#ifdef __APPLE__
LibraryCredentialFile storage()
{ return LibraryCredentialFile(wxGetHomeDir().ToStdString() + "/Library/Application Support/U1 Lab Credentials", "makerworld.token"); }
#endif
bool numeric(const std::string& x) { return !x.empty() && x.size() < 20 && x.find_first_not_of("0123456789") == std::string::npos; }
} // namespace
bool WebViewPanel::HandleMakerWorldMessage(const MJ& input, std::function<void(MJ)> reply)
{
#ifndef __APPLE__
    reply({{"ok", false}, {"error", "Conector MakerWorld disponível nesta versão somente no Mac."}});
    return true;
#else
    wxWeakRef<WebViewPanel> weak(this);
    const auto              command = input.value("command", "");
    auto                    fail    = [reply](const std::string& e) { reply({{"ok", false}, {"error", e}}); };
    try {
        if (m_mw_busy) {
            fail("Aguarde a operação MakerWorld em andamento.");
            return true;
        }
        if (command == "u1_mw_status") {
            storage().load(m_mw_token);
            reply({{"ok", true}, {"data", {{"connected", !m_mw_token.empty()}}}});
            return true;
        }
        if (command == "u1_mw_disconnect") {
            storage().save("");
            m_mw_token.clear();
            m_mw_email.clear();
            m_mw_tfa.clear();
            reply({{"ok", true}, {"data", {{"connected", false}}}});
            return true;
        }
        std::function<MJ()> job;
        bool                auth = false, resolve = false, download = false, search = false;
        if (command == "u1_mw_connect" || command == "u1_mw_verify") {
            auth = true;
            std::string payload, tfa = m_mw_tfa;
            if (command == "u1_mw_connect") {
                wxTextEntryDialog account(this, wxString::FromUTF8("E-mail da sua conta MakerWorld / Bambu Lab (região global)."),
                                          "Conectar MakerWorld");
                if (account.ShowModal() != wxID_OK) {
                    reply({{"ok", true}, {"data", {{"cancelled", true}}}});
                    return true;
                }
                m_mw_email = account.GetValue().ToStdString();
                m_mw_tfa.clear();
                if (m_mw_email.size() > 254 || m_mw_email.find('@') == std::string::npos)
                    throw std::runtime_error("Informe um e-mail válido.");
                wxPasswordEntryDialog password(this,
                                               wxString::FromUTF8("Senha da conta Bambu Lab. Enviada somente à Bambu; não será salva."),
                                               "Conectar MakerWorld");
                if (password.ShowModal() != wxID_OK) {
                    reply({{"ok", true}, {"data", {{"cancelled", true}}}});
                    return true;
                }
                payload = MJ{{"account", m_mw_email}, {"password", password.GetValue().ToStdString()}}.dump();
                tfa.clear();
            } else {
                if (m_mw_email.empty())
                    throw std::runtime_error("Conecte a conta antes de informar o código.");
                wxTextEntryDialog code(this,
                                       wxString::FromUTF8(tfa.empty() ? "Código enviado ao seu e-mail pela Bambu Lab." :
                                                                        "Código do seu aplicativo autenticador."),
                                       wxString::FromUTF8("Verificar conta"));
                if (code.ShowModal() != wxID_OK) {
                    reply({{"ok", true}, {"data", {{"cancelled", true}}}});
                    return true;
                }
                auto value = code.GetValue().ToStdString();
                if (value.size() != 6 || !numeric(value))
                    throw std::runtime_error("Informe o código de seis números.");
                payload = tfa.empty() ? MJ{{"account", m_mw_email}, {"code", value}}.dump() :
                                        MJ{{"tfaKey", tfa}, {"tfaCode", value}}.dump();
            }
            job = [payload, tfa] {
                if (tfa.empty())
                    return json(fetch("https://api.bambulab.com/v1/user-service/user/login", "", payload));
                auto csrf = fetch("https://bambulab.com/api/csrf").csrf;
                if (csrf.empty() || csrf.find_first_of("\r\n") != std::string::npos)
                    throw std::runtime_error("Não foi possível iniciar a verificação do autenticador.");
                return json(fetch("https://bambulab.com/api/sign-in/tfa", "", payload, csrf));
            };
        } else if (command == "u1_mw_search") {
            search             = true;
            const auto filters = input.value("filters", MJ::object());
            const auto query   = input.value("query", "");
            if (query.size() > 800)
                throw std::runtime_error("Pesquisa muito longa.");
            const auto                  sort = filters.value("sort", query.empty() ? "newUploads" : "score");
            const std::set<std::string> orders{"score", "newUploads", "hotScore", "downloadCount", "likeCount", "boosts"};
            if (!orders.count(sort))
                throw std::runtime_error("Ordenação inválida.");
            const auto size = filters.value("per_page", "100");
            if (size != "100" && size != "50" && size != "20")
                throw std::runtime_error("Quantidade inválida.");
            const int page = input.value("page", 1);
            if (page < 1 || page > 500)
                throw std::runtime_error("Página inválida.");
            std::string url = "https://api.bambulab.com/v1/search-service/select/design2?designType=0&orderBy=" + sort + "&limit=" + size +
                              "&offset=" + std::to_string((page - 1) * std::stoi(size));
            if (!query.empty())
                url += "&keyword=" + Http::url_encode(query);
            const std::map<std::string, std::set<std::string>> allowed{{"multiColor", {"true", "false"}},
                                                                       {"nozzleDiameters", {"0.2", "0.4", "0.6", "0.8"}},
                                                                       {"licenses",
                                                                        {"Public Domain", "BY", "BY-SA", "BY-ND", "BY-NC", "BY-NC-SA",
                                                                         "BY-NC-ND", "Standard Digital File License"}}};
            for (const auto& entry : allowed) {
                auto value = filters.value(entry.first, "");
                if (value.empty())
                    continue;
                if (!entry.second.count(value))
                    throw std::runtime_error("Filtro inválido.");
                url += "&" + entry.first + "=" + Http::url_encode(value);
            }
            const auto token = m_mw_token;
            job              = [url, token] {
                auto result = json(fetch(url, token));
                if (!result.contains("hits") || !result["hits"].is_array() || !result.contains("total") || !result["total"].is_number())
                    throw std::runtime_error("O formato da busca MakerWorld mudou.");
                return MJ{{"hits", result["hits"]}, {"total", result["total"]}};
            };
        } else if (command == "u1_mw_resolve") {
            resolve        = true;
            const auto url = input.value("url", "");
            const auto id  = makerworld_model_id(url);
            if (id.empty())
                throw std::runtime_error("Cole um link https://makerworld.com/.../models/... válido.");
            job = [id] { return json(fetch("https://api.bambulab.com/v1/design-service/design/" + id)); };
        } else if (command == "u1_mw_import") {
            download         = true;
            const auto id    = input.value("profile", "");
            auto       found = m_mw_profiles.find(id);
            if (found == m_mw_profiles.end() || !numeric(id))
                throw std::runtime_error("Consulte o modelo e selecione um perfil válido.");
            if (m_mw_token.empty())
                throw std::runtime_error("Conecte sua conta MakerWorld para baixar o projeto.");
            const auto model = found->second, token = m_mw_token;
            const auto directory = boost::filesystem::path(data_dir()) / "model-library" / "makerworld";
            job                  = [id, model, token, directory] {
                auto manifest = json(
                    fetch("https://api.bambulab.com/v1/iot-service/api/user/profile/" + id + "?model_id=" + Http::url_encode(model), token));
                const auto url = manifest.value("url", "");
                if (!makerworld_download_allowed(url))
                    throw std::runtime_error("Servidor de download não reconhecido.");
                auto file = fetch(url, "", "", "", true);
                if (file.body.size() < 4 || file.body.compare(0, 4, std::string("PK\003\004", 4)))
                    throw std::runtime_error("O download não é um projeto 3MF válido.");
                boost::filesystem::create_directories(directory);
                auto          path      = directory / boost::filesystem::unique_path("makerworld-" + id + "-%%%%-%%%%.3mf");
                auto          temporary = path.string() + ".part";
                std::ofstream out(temporary, std::ios::binary);
                out.write(file.body.data(), file.body.size());
                out.close();
                if (!out)
                    throw std::runtime_error("Não foi possível salvar o projeto.");
                boost::filesystem::rename(temporary, path);
                return MJ{{"path", path.string()}};
            };
        } else {
            fail("Comando MakerWorld desconhecido.");
            return true;
        }
        m_mw_busy = true;
        std::thread([job, weak, reply, auth, resolve, download, search] {
            MJ          result;
            std::string error;
            try {
                result = job();
            } catch (const std::exception& e) {
                error = e.what();
            } catch (...) {
                error = "Falha na operação MakerWorld.";
            }
            if (!wxTheApp)
                return;
            wxGetApp().CallAfter([weak, reply, result = std::move(result), error, auth, resolve, download, search] {
                if (!weak)
                    return;
                weak->m_mw_busy = false;
                try {
                    if (!error.empty())
                        throw std::runtime_error(error);
                    if (auth) {
                        auto token = result.value("accessToken", result.value("token", std::string{}));
                        if (!token.empty()) {
                            storage().save(token);
                            weak->m_mw_token = token;
                            weak->m_mw_email.clear();
                            weak->m_mw_tfa.clear();
                            reply({{"ok", true}, {"data", {{"connected", true}}}});
                        } else if (result.value("loginType", "") == "verifyCode" || result.value("loginType", "") == "tfa" ||
                                   result.contains("tfaKey")) {
                            weak->m_mw_tfa = result.value("tfaKey", "");
                            reply({{"ok", true}, {"data", {{"verification", true}}}});
                        } else
                            throw std::runtime_error("Login não concluído. Confira os dados da conta.");
                    } else if (resolve) {
                        weak->m_mw_profiles.clear();
                        MJ         profiles = MJ::array();
                        const auto model    = result.value("modelId", "");
                        for (const auto& instance : result.value("instances", MJ::array())) {
                            if (!instance.contains("profileId") || !instance["profileId"].is_number_integer())
                                continue;
                            const auto id = std::to_string(instance["profileId"].get<long long>());
                            if (!numeric(id) || model.empty())
                                continue;
                            weak->m_mw_profiles[id] = model;
                            profiles.push_back(
                                {{"id", id},
                                 {"title", instance.value("title", "")},
                                 {"plates",
                                  instance.value("extention", MJ::object()).value("modelInfo", MJ::object()).value("plates", MJ::array())}});
                        }
                        reply({{"ok", true},
                               {"data",
                                {{"title", result.value("title", "")},
                                 {"creator", result.value("designCreator", MJ::object()).value("name", "")},
                                 {"license", result.value("license", "")},
                                 {"cover", result.value("coverUrl", "")},
                                 {"summary", result.value("summary", "")},
                                 {"profiles", profiles}}}});
                    } else if (search) {
                        reply({{"ok", true}, {"data", result}});
                    } else if (download) {
                        // Preserve the complete project and painting. Native import handles format compatibility.
                        wxGetApp().request_open_project(result.at("path").get<std::string>());
                        reply({{"ok", true}, {"data", {{"imported", true}}}});
                    }
                } catch (const std::exception& e) {
                    reply({{"ok", false}, {"error", e.what()}});
                }
            });
        }).detach();
    } catch (const std::exception& e) {
        fail(e.what());
    }
    return true;
#endif
}
}} // namespace Slic3r::GUI
