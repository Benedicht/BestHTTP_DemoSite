using System;
using System.Collections.Generic;
using System.IdentityModel.Tokens.Jwt;
using System.IO;
using System.Linq;
using System.Security.Claims;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.HttpsPolicy;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.StaticFiles;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Primitives;
using Microsoft.Extensions.Hosting;
using Microsoft.IdentityModel.Tokens;
using Newtonsoft.Json;
using System.Net.WebSockets;
using System.Threading;

namespace BestHTTP_DemoSite
{
    public class Startup
    {
        private readonly SymmetricSecurityKey SecurityKey = new SymmetricSecurityKey(System.Text.Encoding.ASCII.GetBytes("Super secret security key!"));
        private readonly JwtSecurityTokenHandler JwtTokenHandler = new JwtSecurityTokenHandler();

        public Startup(IConfiguration configuration)
        {
            Configuration = configuration;
        }

        public IConfiguration Configuration { get; }

        // This method gets called by the runtime. Use this method to add services to the container.
        public void ConfigureServices(IServiceCollection services)
        {
            services.AddResponseCompression();

            services.AddCors();

            services.Configure<CookiePolicyOptions>(options =>
            {
                // This lambda determines whether user consent for non-essential cookies is needed for a given request.
                options.CheckConsentNeeded = context => true;
                options.MinimumSameSitePolicy = SameSiteMode.None;
            });

            services.AddAuthorization(options =>
            {
                options.AddPolicy(JwtBearerDefaults.AuthenticationScheme, policy =>
                {
                    policy.AddAuthenticationSchemes(JwtBearerDefaults.AuthenticationScheme);
                    policy.RequireClaim(ClaimTypes.NameIdentifier);
                });
            });

            services.AddAuthentication(options =>
                {
                    // Identity made Cookie authentication the default.
                    // However, we want JWT Bearer Auth to be the default.
                    options.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
                    options.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme;
                })
                .AddJwtBearer(options =>
                {
                        // Configure JWT Bearer Auth to expect our security key
                        options.TokenValidationParameters =
                        new TokenValidationParameters
                        {
                            LifetimeValidator = (before, expires, token, param) =>
                            {
                                return expires > DateTime.UtcNow;
                            },
                            ValidateAudience = false,
                            ValidateIssuer = false,
                            ValidateActor = false,
                            ValidateLifetime = false,
                            ValidateIssuerSigningKey = false,
                            ValidateTokenReplay = false,
                            IssuerSigningKey = SecurityKey,
                        };

                        // We have to hook the OnMessageReceived event in order to
                        // allow the JWT authentication handler to read the access
                        // token from the query string when a WebSocket or 
                        // Server-Sent Events request comes in.
                        options.Events = new JwtBearerEvents {
                                OnMessageReceived = context =>
                                {
                                    string accessToken = context.Request.Query["access_token"].ToString();
                                    
                                    // If the request is for our hub...
                                    var path = context.HttpContext.Request.Path;
                                    if (!string.IsNullOrEmpty(accessToken) && (path.StartsWithSegments("/HubWithAuthorization")))
                                    {
                                            // Read the token out of the query string
                                            context.Token = accessToken;
                                    }
                                    return Task.CompletedTask;
                                }
                            };
                });

            services.AddSignalR(options =>
            {
                options.EnableDetailedErrors = true;
                //options.KeepAliveInterval = TimeSpan.FromSeconds(1);
                options.MaximumParallelInvocationsPerClient = 10;
            }).AddMessagePackProtocol(options =>
            {
                //options.SerializerOptions.
            });
        }

        // This method gets called by the runtime. Use this method to configure the HTTP request pipeline.
        public void Configure(IApplicationBuilder app, IWebHostEnvironment env)
        {
            app.UseResponseCompression();

            if (env.IsDevelopment())
            {
                app.UseDeveloperExceptionPage();
            }
            else
            {
                app.UseExceptionHandler("/Error");
                app.UseHsts();
            }

            //app.UseCors("Everything");
            app.UseCors(builder =>
            {
                builder.WithOrigins("https://localhost:4000", "https://besthttpdemosite.azurewebsites.net", "https://besthttpdemo.azureedge.net", "https://besthttpwebgldemo.azurewebsites.net", "https://benedicht.github.io")
                       .AllowAnyMethod()
                       .AllowAnyHeader()
                       .AllowCredentials()
                       .WithHeaders("Authorization");
            });

            //app.UseHttpsRedirection();
            app.UseCookiePolicy();

            app.UseRouting();

            app.UseAuthorization();

            app.UseEndpoints(endpoints =>
            {
                endpoints.MapHub<Hubs.TestHub>("/TestHub");
                endpoints.MapHub<Hubs.HubWithAuthorization>("/HubWithAuthorization");
                endpoints.MapHub<Hubs.UploadHub>("/uploading");
            });

            //app.UseSignalR(routes =>
            //{
            //    routes.MapHub<Hubs.TestHub>("/TestHub");
            //    routes.MapHub<Hubs.HubWithAuthorization>("/HubWithAuthorization");
            //    routes.MapHub<Hubs.UploadHub>("/uploading");
            //});

            app.UseDefaultFiles();

            StaticFileOptions option = new StaticFileOptions();
            //FileExtensionContentTypeProvider contentTypeProvider = (FileExtensionContentTypeProvider)option.ContentTypeProvider ?? new FileExtensionContentTypeProvider();
            //contentTypeProvider.Mappings.Add(".assetbundle", "application/octet-stream");
            //contentTypeProvider.Mappings.Add(".mem", "application/octet-stream");
            //contentTypeProvider.Mappings.Add(".data", "application/octet-stream");
            //contentTypeProvider.Mappings.Add(".memgz", "application/octet-stream");
            //contentTypeProvider.Mappings.Add(".datagz", "application/octet-stream");
            //contentTypeProvider.Mappings.Add(".unity3dgz", "application/octet-stream");
            //contentTypeProvider.Mappings.Add(".unityweb", "application/octet-stream");
            //contentTypeProvider.Mappings.Add(".unitypackage", "application/octet-stream");
            //contentTypeProvider.Mappings.Add(".jsgz", "application/x-javascript; charset=UTF-8");
            //option.ContentTypeProvider = contentTypeProvider;

            option.DefaultContentType = "application/octet-stream";
            option.ServeUnknownFileTypes = true;
            option.OnPrepareResponse += content =>
            {
                if (content.File.Name.EndsWith(".gz"))
                {
                    content.Context.Response.Headers["Content-Encoding"] = "gzip";
                }

                const int durationInSeconds = 60 * 60 * 24;
                content.Context.Response.Headers[Microsoft.Net.Http.Headers.HeaderNames.CacheControl] = "public,max-age=" + durationInSeconds;
            };

            app.UseStaticFiles(option);

            WebSocketOptions options = new WebSocketOptions();
            app.UseWebSockets(options);

            app.Run(async (context) =>
            {
                if (context.Request.Path.StartsWithSegments("/generateJwtToken"))
                {
                    await context.Response.WriteAsync(GenerateJwtToken());
                    return;
                }
                else if (context.Request.Path.StartsWithSegments("/redirect"))
                {
                    await context.Response.WriteAsync(JsonConvert.SerializeObject(new
                    {
                        url = $"{context.Request.Scheme}://{context.Request.Host}/HubWithAuthorization?testkey1=testvalue1&testkey2=testvalue2",
                        accessToken = GenerateJwtToken()
                    }));
                }
                else if (context.Request.Path.StartsWithSegments("/forever_redirect"))
                {
                    await context.Response.WriteAsync(JsonConvert.SerializeObject(new
                    {
                        url = $"{context.Request.Scheme}://{context.Request.Host}/forever_redirect"
                    }));
                }
                else if (context.Request.Path.StartsWithSegments("/redirect_sample"))
                {
                    // Endpoint for RedirectSample. It will search for the 'x-redirect-count' header and if found
                    //  it will try to convert its value to an int. If its value is greater or equal to 5, the client
                    //  is will be redirected to the regular endpoint (/redirect) to get a jwt token and proceed 
                    //  forward to the /HubWithAuthorization hub.

                    string path = "redirect_sample";
                    var redirectCount = context.Request.Headers["X-Redirect-Count"];
                    if (redirectCount != StringValues.Empty && int.TryParse(redirectCount[0], out int count) && count >= 5)
                        path = "redirect";

                    await context.Response.WriteAsync(JsonConvert.SerializeObject(new
                    {
                        url = $"{context.Request.Scheme}://{context.Request.Host}/{path}"
                        //url = $"/{path}?testkey1=testvalue1&testkey2=testvalue2"
                    }));
                } 
                else if (context.Request.Path.ToString().Equals("/sse"))
                {
                    // https://stackoverflow.com/questions/36227565/aspnet-core-server-sent-events-response-flush

                    var response = context.Response;
                    response.Headers.Add("Content-Type", "text/event-stream");

                    for (var i = 0; true; ++i)
                    {
                        await response.WriteAsync(": this is a comment!\r\r");
                        await response.WriteAsync("event: datetime\r");
                        await response.WriteAsync($"data: {{\"eventid\": {i}, \"datetime\": \"{DateTime.Now}\"}}\r\r");
                        await response.WriteAsync("data: Message from the server without an event.\r\r");

                        await response.Body.FlushAsync();
                        await Task.Delay(5 * 1000);
                    }
                }
                else if (context.Request.Path == "/ws")
                {
                    if (context.WebSockets.IsWebSocketRequest)
                    {
                        WebSocket webSocket = await context.WebSockets.AcceptWebSocketAsync();
                        await WebSocketEcho(context, webSocket);
                    }
                    else
                    {
                        context.Response.StatusCode = 400;
                    }
                }
            });
        }

        private async Task WebSocketEcho(HttpContext context, WebSocket webSocket)
        {
            var buffer = new byte[UInt16.MaxValue * 5];

            WebSocketReceiveResult result = await webSocket.ReceiveAsync(new ArraySegment<byte>(buffer), CancellationToken.None);
            while (!result.CloseStatus.HasValue)
            {
                //System.Diagnostics.Debug.WriteLine(string.Format("Received - type: {0}, final: {1}, count: {2}", result.MessageType, result.EndOfMessage, result.Count));
                //Console.WriteLine(string.Format("Received - type: {0}, final: {1}, count: {2}", result.MessageType, result.EndOfMessage, result.Count));

                await webSocket.SendAsync(new ArraySegment<byte>(buffer, 0, result.Count), result.MessageType, result.EndOfMessage, CancellationToken.None);

                result = await webSocket.ReceiveAsync(new ArraySegment<byte>(buffer), CancellationToken.None);
            }
            await webSocket.CloseAsync(result.CloseStatus.Value, result.CloseStatusDescription, CancellationToken.None);
        }

        private string GenerateJwtToken()
        {
            var claims = new[] { new Claim(ClaimTypes.NameIdentifier, "besthttp_demo_user") };
            var credentials = new SigningCredentials(SecurityKey, SecurityAlgorithms.HmacSha256);
            var token = new JwtSecurityToken("BestHTTP Demo Site", "BestHTTP Demo Site Users", claims, expires: DateTime.Now.AddHours(15), signingCredentials: credentials);
            return JwtTokenHandler.WriteToken(token);
        }
    }
}
