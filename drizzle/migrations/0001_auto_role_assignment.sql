create or replace function public.assign_initial_roles()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if lower(new.email) = 'admin@verunda.com' then
    insert into public.user_roles (user_id, role) values (new.id, 'super_admin')
      on conflict do nothing;
  end if;

  if new.team_id is not null and exists (
    select 1 from public.teams t where t.id = new.team_id and lower(coalesce(t.leader_email,'')) = lower(new.email)
  ) then
    insert into public.user_roles (user_id, role) values (new.id, 'team_leader') on conflict do nothing;
    update public.teams set leader_id = new.id where id = new.team_id;
  end if;

  insert into public.user_roles (user_id, role) values (new.id, 'member') on conflict do nothing;
  return new;
end;
$$;

create trigger profiles_assign_roles
after insert on public.profiles
for each row execute function public.assign_initial_roles();