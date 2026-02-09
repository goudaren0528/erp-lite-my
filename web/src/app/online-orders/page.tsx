import { getCurrentUser } from "@/lib/auth"
import { getAppConfigValue } from "@/app/actions"
import { redirect } from "next/navigation"
import { OnlineOrdersClient } from "./online-orders-client"

export default async function OnlineOrdersPage() {
  const currentUser = await getCurrentUser()
  const isAdmin = currentUser?.role === 'ADMIN'
  const canAccessOnlineOrders = isAdmin || currentUser?.permissions?.includes('online_orders')

  if (!canAccessOnlineOrders) {
    redirect('/')
  }

  const defaultConfig = {
    interval: 420,
    headless: false,
    nightMode: true,
    nightPeriod: { start: 0, end: 9 },
    webhookUrls: [],
    deviceMappings: [],
    sites: [
      {
        id: "chenlin",
        name: "诚赁",
        enabled: true,
        loginUrl: "https://merchant.chenlinzuwu.com/admin/dist/index.html",
        username: "",
        password: "",
        maxPages: 0,
        selectors: {
          login_button: "#app > div > form > button",
          order_menu_link: "https://merchant.chenlinzuwu.com/admin/dist/index.html#/orders/orderList",
          password_input: "#app > div > form > div.el-form-item.el-tooltip.el-form-item--medium > div > div > input",
          pending_count_element: "#pane-审核中 > div.flex-c.jc-s > div:nth-child(2) > div > span.el-pagination__total",
          pending_tab_selector: "#tab-审核中",
          username_input: "#app > div > form > div:nth-child(2) > div > div > input",
          order_list_container: "",
          order_row_selectors: "",
          order_row_selector_template: "",
          order_row_index_start: "",
          order_row_index_step: "",
          order_row_index_end: "",
          pagination_next_selector: ""
        }
      },
      {
        id: "aolzu",
        name: "奥租",
        enabled: true,
        loginUrl: "https://seller-ui.kusen888.com/login",
        username: "",
        password: "",
        maxPages: 0,
        selectors: {
          login_button: "#main > div > div > div > div.ivu-row > div > div",
          order_menu_link: "https://seller-ui.kusen888.com/orderList",
          password_input: "#main > div > div > div > div.ivu-row > form > div:nth-child(2) > div > div > input",
          pending_count_element: "#main > div > div.single-page-con > div > div > div > div > div:nth-child(6) > ul > span",
          pending_tab_selector: "#main > div > div.single-page-con > div > div > div > div > ul > li:nth-child(3)",
          username_input: "#main > div > div > div > div.ivu-row > form > div.ivu-form-item.ivu-form-item-required > div > div.ivu-input-wrapper.ivu-input-wrapper-large.ivu-input-type-text > input",
          order_list_container: "",
          order_row_selectors: "",
          order_row_selector_template: "",
          order_row_index_start: "",
          order_row_index_step: "",
          order_row_index_end: "",
          pagination_next_selector: ""
        }
      },
      {
        id: "youpin",
        name: "优品租",
        enabled: true,
        loginUrl: "https://merchant.qnvipmall.com/login?redirect=%2Findex",
        username: "",
        password: "",
        maxPages: 0,
        selectors: {
          login_button: "#app > div.login > form > div:nth-child(6) > div > button",
          order_menu_link: "https://merchant.qnvipmall.com/order/audit",
          password_input: "#app > div.login > form > div:nth-child(3) > div > div > input",
          pending_count_element: "#app > div.app-wrapper.openSidebar > div.main-container.hasTagsView > div:nth-child(2) > section > div > div.app-pager > div > span.el-pagination__total",
          pending_tab_selector: "#tags-view-container > div > div.el-scrollbar__wrap > div > span.tags-view-item.router-link-exact-active.router-link-active.active",
          username_input: "#app > div.login > form > div:nth-child(2) > div > div > input",
          order_list_container: "",
          order_row_selectors: "",
          order_row_selector_template: "",
          order_row_index_start: "",
          order_row_index_step: "",
          order_row_index_end: "",
          pagination_next_selector: ""
        }
      },
      {
        id: "llxzu",
        name: "零零享",
        enabled: true,
        loginUrl: "https://www.llxzu.com/businessNew/#/user/login",
        username: "",
        password: "",
        maxPages: 0,
        selectors: {
          login_button: "#root > div > div > div.ant-spin-nested-loading.css-1x0dypw > div > div > div > div.ant-pro-form-login-main.css-1x0dypw > form > button",
          order_menu_link: "https://www.llxzu.com/businessNew/#/Order/OrderManage/OrderList",
          password_input: "#smsLoginVerifyCode",
          pending_count_element: "#root > div > div.ant-layout.ant-layout-has-sider.css-dag3b9 > div.ant-pro-layout-container.css-dag3b9 > main > div.ant-pro-page-container.css-dag3b9 > div.ant-pro-grid-content.css-dag3b9 > div > div > div.css-dag3b9.ant-pro-page-container-children-container > div.orderListStyle > div:nth-child(3) > div > ul > li.ant-pagination-total-text",
          pending_tab_selector: "#root > div > div.ant-layout.ant-layout-has-sider.css-dag3b9 > div.ant-pro-layout-container.css-dag3b9 > main > div.ant-pro-page-container.css-dag3b9 > div.ant-pro-grid-content.css-dag3b9 > div > div > div.css-dag3b9.ant-pro-page-container-children-container > div.orderListStyle > div:nth-child(2) > div > div.order_tabs > div.ant-tabs.ant-tabs-top.css-dag3b9 > div.ant-tabs-nav > div.ant-tabs-nav-wrap.ant-tabs-nav-wrap-ping-right > div > div:nth-child(3)",
          username_input: "#mobile",
          order_list_container: "",
          order_row_selectors: "",
          order_row_selector_template: "",
          order_row_index_start: "",
          order_row_index_step: "",
          order_row_index_end: "",
          pagination_next_selector: ""
        }
      },
      {
        id: "doulaizu",
        name: "兜来租",
        enabled: true,
        loginUrl: "https://dlz.doulaizu.com.cn",
        username: "",
        password: "",
        maxPages: 0,
        selectors: {
          login_button: "#btn-login",
          order_list_container: "body > div.wb-container.right-panel > div.page-content > form > div > div",
          order_menu_link: "https://dlz.doulaizu.com.cn/web/merchant.php?c=site&a=entry&m=ewei_shopv2&do=web&r=order.list.status1",
          password_input: "body > div.signinpanel > div > div.col-sm-5 > form > input.form-control.m-b",
          pending_count_element: "#myTab > li:nth-child(3) > a >> visible=true",
          pending_tab_selector: "#myTab > li:nth-child(3) > a >> visible=true",
          username_input: "body > div.signinpanel > div > div.col-sm-5 > form > input:nth-child(3)",
          order_row_selectors: "",
          order_row_selector_template: "",
          order_row_index_start: "",
          order_row_index_step: "",
          order_row_index_end: "",
          pagination_next_selector: ""
        }
      },
      {
        id: "zanchen",
        name: "赞晨",
        enabled: true,
        loginUrl: "https://szguokuai.zlj.xyzulin.top/web/index.php?c=user&a=login&&i=1",
        username: "",
        password: "",
        maxPages: 0,
        selectors: {
          login_button: "#form1 > button",
          order_menu_link: "https://szguokuai.zlj.xyzulin.top/web/index.php?c=site&a=entry&m=ewei_shopv2&do=web&r=order.list.status1",
          password_input: "#form1 > div > div:nth-child(4) > input",
          pending_count_element: "",
          pending_tab_selector: "#myTab > li:nth-child(3) > a",
          username_input: "#form1 > div > div:nth-child(3) > input",
          order_list_container: "#table > div > div > div",
          order_row_selectors: "",
          order_row_selector_template: "#table > div > div > div > div:nth-child({i})",
          order_row_index_start: "4",
          order_row_index_step: "2",
          order_row_index_end: "",
          pagination_next_selector: ""
        }
      }
    ]
  }
  const rawConfig = await getAppConfigValue("online_orders_sync_config")
  let initialConfig = defaultConfig
  if (rawConfig) {
    try {
      const parsed = JSON.parse(rawConfig)
      if (parsed && Array.isArray(parsed.sites)) {
        const defaultSiteMap = new Map(defaultConfig.sites.map(site => [site.id, site]))
        initialConfig = {
          ...defaultConfig,
          ...parsed,
          sites: parsed.sites.map((site: typeof defaultConfig.sites[number]) => {
            const fallback = defaultSiteMap.get(site.id)
            return {
              ...fallback,
              ...site,
              maxPages: typeof site.maxPages === "number" ? site.maxPages : fallback?.maxPages ?? 0,
              selectors: {
                ...fallback?.selectors,
                ...site.selectors
              }
            }
          })
        }
      }
    } catch {
      initialConfig = defaultConfig
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">线上订单管理</h2>
        <p className="text-muted-foreground">查看和管理线上订单数据。</p>
        <div className="mt-3">
          <OnlineOrdersClient initialConfig={initialConfig} />
        </div>
      </div>
    </div>
  )
}
