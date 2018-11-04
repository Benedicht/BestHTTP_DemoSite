using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.HttpsPolicy;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.StaticFiles;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.FileProviders;

namespace BestHTTP_DemoSite
{
    public class Startup
    {
        public Startup(IConfiguration configuration)
        {
            Configuration = configuration;
        }

        public IConfiguration Configuration { get; }

        // This method gets called by the runtime. Use this method to add services to the container.
        public void ConfigureServices(IServiceCollection services)
        {
            services.Configure<CookiePolicyOptions>(options =>
            {
                // This lambda determines whether user consent for non-essential cookies is needed for a given request.
                options.CheckConsentNeeded = context => true;
                options.MinimumSameSitePolicy = SameSiteMode.None;
            });

            services.AddSignalR();
        }

        // This method gets called by the runtime. Use this method to configure the HTTP request pipeline.
        public void Configure(IApplicationBuilder app, IHostingEnvironment env)
        {
            if (env.IsDevelopment())
            {
                app.UseDeveloperExceptionPage();
            }
            else
            {
                app.UseExceptionHandler("/Error");
                app.UseHsts();
            }

            app.UseHttpsRedirection();
            app.UseCookiePolicy();

            app.UseSignalR(routes =>
            {
                routes.MapHub<Hubs.TestHub>("/TestHub");
            });

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
            app.UseStaticFiles(option);
        }
    }
}
